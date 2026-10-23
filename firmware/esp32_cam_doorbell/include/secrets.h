#pragma once

// Copy this file to secrets.h. It is deliberately ignored by Git.
#define WIFI_SSID "Sheikh alee"
#define WIFI_PASSWORD "Qwer3236060950"

// Render/cloud example: your-doorbell.onrender.com, port 443, SSL true.
// Local example: 192.168.1.100, port 3000, SSL false.
#define BACKEND_HOST "smart-bell-app.onrender.com"
#define BACKEND_PORT 443
#define BACKEND_USE_SSL true

// Must exactly match DEVICE_HMAC_KEY and DEVICE_CONNECTION_TOKEN in the server environment.
#define DEVICE_HMAC_KEY "3c653b47375ca44413a2f0e02ae73900"
#define DEVICE_CONNECTION_TOKEN "a8ed2788f42e66d21d341855e6d7647e"

// Trusted certificate for the backend HTTPS connection.
#include "backend_root_ca.h"
