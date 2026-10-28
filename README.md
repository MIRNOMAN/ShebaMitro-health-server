# ShebaMitro Health Server (NestJS 11 Backend)

> Production-grade NestJS REST API and Socket.io WebRTC Gateway for the ShebaMitro Healthcare Ecosystem.

---

## 🔐 Verified Demo Login Credentials

> [!IMPORTANT]
> **All accounts are pre-verified in the database (`is_verified: true`)**. No OTP or email verification code is required during login.

### 🌟 1. Primary Demo Accounts (Password: `Password123!`)
| Role | Email | Password | Status | Profile Description |
| :--- | :--- | :--- | :--- | :--- |
| **PATIENT** | `patient@shebamitro.health` | `Password123!` | `✅ Verified` | Sabbir Ahmed (Patient Profile) |
| **DOCTOR** | `doctor@shebamitro.health` | `Password123!` | `✅ Verified` | Dr. Tanzil Rahman / Prof. Dr. Syed Mahmudul Hasan |
| **DOCTOR (Teleconsult)** | `dr.arif@shebamitro.health` | `Password123!` | `✅ Verified` | Dr. Kazi Arif (Pediatrics Specialist) |
| **PHARMACY** | `pharmacy@shebamitro.health` | `Password123!` | `✅ Verified` | Lazz Pharma (Dhanmondi Model Pharmacy) |
| **LAB** | `lab@shebamitro.health` | `Password123!` | `✅ Verified` | Popular Diagnostic Centre |
| **ADMIN** | `admin@shebamitro.health` | `Password123!` | `✅ Verified` | System Administrator |

---

### 🔑 2. Custom Demo Accounts (Password: `$$Baki09$$`)
| Role | Email | Password | Status | Profile Description |
| :--- | :--- | :--- | :--- | :--- |
| **PATIENT** | `rapadi9855@iconcubic.com` | `$$Baki09$$` | `✅ Verified` | Verified Patient Account |
| **DOCTOR** | `doctor.baki@shebamitro.health` | `$$Baki09$$` | `✅ Verified` | Dr. Baki Billah (Cardiology Specialist) |
| **PHARMACY** | `pharmacy.baki@shebamitro.health` | `$$Baki09$$` | `✅ Verified` | Baki Model Pharmacy Hub |
| **LAB** | `lab.baki@shebamitro.health` | `$$Baki09$$` | `✅ Verified` | Baki Clinical Diagnostics Lab |
| **ADMIN** | `admin.baki@shebamitro.health` | `$$Baki09$$` | `✅ Verified` | Baki Super Admin |

---

## 🚀 Running the Server

```bash
# Install dependencies
npm install

# Generate Prisma Client
npx prisma generate

# Run development server with auto-reload (Port 5100)
npm run start:dev
```

- API Base URL: `http://localhost:5100/api/v1`
- Swagger Documentation: `http://localhost:5100/docs`
