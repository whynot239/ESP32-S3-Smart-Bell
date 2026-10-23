# Review of the user's tag exports

The original Downloads files were read without changes. The user confirmed both tags are new and dedicated to the doorbell.

| Tag | UID in manufacturer block | Export size | Candidate credential storage |
|---|---|---|---|
| White card | F909F41F | 64 blocks, 1024 bytes | Sector 15: data blocks 60, 61, 62; trailer 63 |
| Blue fob | 9A130156 | 64 blocks, 1024 bytes | Sector 15: data blocks 60, 61, 62; trailer 63 |

Both exports are consistent with MIFARE Classic 1K-compatible memory. This is not proof of chip authenticity. Both manufacturer-block UID check bytes are consistent. Both exports show all-zero data in sector 15, access bytes 7F0788 and GPB 40. Earlier sectors contain data consistent with NFC/NDEF formatting, so neither dump should be treated as an entirely factory-blank card.

The all-zero key fields are not evidence that the real authentication keys are all zero. Key A cannot be read as ordinary data; access settings also affect whether Key B is readable. The phone export cannot establish the keys needed to change the sector trailer.

The read-only preflight firmware (3.1.0-rc4-inspect2) extends RFID INSPECT. For Classic 1K/4K it tests common initial Key A patterns (factory FF, public NDEF, zero) and common initial Key B patterns (factory FF, zero), reactivating and selecting the same UID before each authentication attempt. It reads only blocks 60-63. It reports authentication category, whether data blocks are zero, and the access bytes with their redundant encoding validated. It does not print card data or private keys, write blocks, change keys, enable card access or unlock during inspection.

Next required evidence: the actual RC522 authentication/read results for each physical tag. An authentication success is not itself proof of write permission; access conditions must be evaluated before enrollment. No provisioning is implemented or claimed complete by this diagnostic update.

Technical references:
- NXP MIFARE Classic datasheet: https://cache.nxp.com/docs/en/data-sheet/MF1S50YYX_V1.pdf
- NXP NDEF mapping: https://www.nxp.com/docs/en/application-note/AN1305.pdf

The read-only preflight update built and uploaded successfully to COM9, with flash hash verification. Console-mode regression tests passed. Live sector authentication results still require the user to present each tag while RFID INSPECT is active. No tag contents or keys have been written.
