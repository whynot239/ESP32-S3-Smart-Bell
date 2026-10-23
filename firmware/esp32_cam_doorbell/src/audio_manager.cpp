#include "audio_manager.h"
#include <math.h>
#include "audio_processing.h"

static_assert(SPEECH_PLAYBACK_GAIN >= 1 && SPEECH_PLAYBACK_GAIN <= 8, "Speech gain must be between 1 and 8.");

AudioManager audioManager;

AudioManager::AudioManager() : initialized(false), micMuted(false) {}

bool AudioManager::begin() {
    i2s_config_t i2s_config = {
        .mode = (i2s_mode_t)(I2S_MODE_MASTER | I2S_MODE_TX | I2S_MODE_RX),
        .sample_rate = AUDIO_SAMPLE_RATE,
        .bits_per_sample = I2S_BITS_PER_SAMPLE_32BIT,
        .channel_format = I2S_CHANNEL_FMT_RIGHT_LEFT,
        .communication_format = I2S_COMM_FORMAT_STAND_I2S,
        .intr_alloc_flags = ESP_INTR_FLAG_LEVEL1,
        .dma_buf_count = 8,
        .dma_buf_len = 64,
        .use_apll = false,
        .tx_desc_auto_clear = true,
        .fixed_mclk = 0
    };

    i2s_pin_config_t pin_config = {
        .mck_io_num = I2S_PIN_NO_CHANGE,
        .bck_io_num = PIN_I2S_BCLK,
        .ws_io_num = PIN_I2S_WS,
        .data_out_num = PIN_AMP_DATA,
        .data_in_num = PIN_MIC_DATA
    };

    esp_err_t err = i2s_driver_install(I2S_PORT_NUM, &i2s_config, 0, NULL);
    if (err != ESP_OK) {
        Serial.printf("❌ [AUDIO] I2S driver install failed: 0x%x\n", err);
        return false;
    }

    err = i2s_set_pin(I2S_PORT_NUM, &pin_config);
    if (err != ESP_OK) {
        Serial.printf("❌ [AUDIO] I2S pin configuration failed: 0x%x\n", err);
        return false;
    }

    microphoneQueue = xQueueCreate(96, sizeof(AudioFrame));
    speakerQueue = xQueueCreate(64, sizeof(AudioFrame));
    if (!microphoneQueue || !speakerQueue) return false;
    if (xTaskCreatePinnedToCore(worker, "audio", 6144, this, 2, nullptr, 0) != pdPASS) return false;
    initialized = true;
    Serial.printf("[AUDIO] Incoming speech gain: %ux; local tone levels unchanged.\n", unsigned(SPEECH_PLAYBACK_GAIN));
    Serial.println("✅ [AUDIO] Full-Duplex I2S Engine ready (Mic: GPIO 14, Amp: GPIO 47).");
    return true;
}

void AudioManager::playTone(int freqHz, int durationMs, float volume) {
    if (!initialized) return;
    AudioFrame frame{};
    int count = AUDIO_SAMPLE_RATE * durationMs / 1000;
    for (int start = 0; start < count; start += 160) {
        for (int i = 0; i < 160; ++i) frame.samples[i] = start+i < count ?
            int16_t(sinf(2.0f * PI * freqHz * (start+i) / AUDIO_SAMPLE_RATE) * 32767.0f * volume) : 0;
        if (xQueueSend(speakerQueue, &frame, pdMS_TO_TICKS(25)) != pdTRUE) break;
    }
}

void AudioManager::playDingDongChime() {
    playTone(659, 250, 0.6f); // Ding (E5)
    delay(60);
    playTone(523, 400, 0.6f); // Dong (C5)
}

void AudioManager::playAccessGrantedTone() {
    playTone(880, 100, 0.5f);
    delay(30);
    playTone(1320, 200, 0.5f);
}

void AudioManager::playAccessDeniedTone() {
    playTone(220, 180, 0.6f);
    delay(50);
    playTone(220, 250, 0.6f);
}

void AudioManager::playVoiceReplyAlert() {
    playTone(587, 80, 0.4f);
    delay(30);
    playTone(880, 150, 0.4f);
}

size_t AudioManager::writeSpeakerData(const uint8_t* data, size_t length) {
    if (!initialized || !data || length % 320 != 0 || length > 2560) return 0;
    size_t accepted = 0;
    while (accepted < length) {
        AudioFrame frame;
        frame.speech = true;
        memcpy(frame.samples, data + accepted, 320);
        for (int i = 0; i < 160; ++i) frame.samples[i] = amplifySpeechSample(frame.samples[i], speechGain.load());
        if (xQueueSend(speakerQueue, &frame, 0) != pdTRUE) break;
        accepted += 320;
    }
    return accepted;
}

size_t AudioManager::readMicrophoneData(int16_t* buffer, size_t maxSamples) {
    if (!initialized || !buffer || maxSamples < 160) return 0;
    AudioFrame frame;
    size_t samples = 0;
    while (samples + 160 <= maxSamples && xQueueReceive(microphoneQueue, &frame, 0) == pdTRUE) {
        if (micMuted.load()) continue;
        memcpy(buffer + samples, frame.samples, 320);
        samples += 160;
    }
    return samples * sizeof(int16_t); // PCM16 mono, 16 kHz; drain a complete network batch.
}

void AudioManager::resetStream() {
    if (!initialized) return;
    xQueueReset(microphoneQueue);
    xQueueReset(speakerQueue);
}

void AudioManager::worker(void* arg) { static_cast<AudioManager*>(arg)->service(); }
void AudioManager::service() {
    int32_t input[320], output[320];
    bool speechPlaying = false;
    unsigned waitFrames = 0;
    AudioGapSmoother smoother;
    for (;;) {
        size_t read = 0;
        if (i2s_read(I2S_PORT_NUM, input, sizeof(input), &read, pdMS_TO_TICKS(20)) != ESP_OK || read == 0) {
            vTaskDelay(pdMS_TO_TICKS(1)); continue;
        }
        AudioFrame mic{};
        for (size_t i = 0; i < read / 8 && i < 160; ++i)
            mic.samples[i] = int16_t(input[i * 2] >> 16); // INMP441 L/R tied LOW, left slot.
        if (xQueueSend(microphoneQueue, &mic, 0) != pdTRUE) {
            AudioFrame discarded;
            xQueueReceive(microphoneQueue, &discarded, 0);
            xQueueSend(microphoneQueue, &mic, 0);
        }
        AudioFrame speaker{};
        bool available = false;
        if (xQueuePeek(speakerQueue, &speaker, 0) == pdTRUE) {
            // Local chimes start immediately. Speech prebuffers 120 ms after a gap;
            // a short final burst also starts after at most 120 ms of waiting.
            if (!speaker.speech || speechPlaying || uxQueueMessagesWaiting(speakerQueue) >= 12 || ++waitFrames >= 12) {
                available = xQueueReceive(speakerQueue, &speaker, 0) == pdTRUE;
                speechPlaying = available && speaker.speech;
                waitFrames = 0;
            }
        } else { speechPlaying = false; waitFrames = 0; }
        for (size_t i = 0; i < 160; ++i) {
            int16_t sample = smoother.process(available ? speaker.samples[i] : 0, available);
            output[2*i] = output[2*i+1] = int32_t(sample) * 65536;
        }
        size_t written = 0;
        i2s_write(I2S_PORT_NUM, output, sizeof(output), &written, pdMS_TO_TICKS(20));
    }
}
