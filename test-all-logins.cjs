const accounts = [
  { role: 'PATIENT', email: 'patient@shebamitro.health' },
  { role: 'DOCTOR', email: 'doctor@shebamitro.health' },
  { role: 'PHARMACY', email: 'pharmacy@shebamitro.health' },
  { role: 'LAB', email: 'lab@shebamitro.health' },
];

async function testLogins() {
  console.log('Testing authentication against http://localhost:5100/api/v1/auth/login...\n');

  for (const acc of accounts) {
    try {
      const res = await fetch('http://localhost:5100/api/v1/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: acc.email,
          password: 'Password123!',
        }),
      });

      const data = await res.json();
      if (res.ok) {
        console.log(`✅ [${acc.role}] Login SUCCESS:`, {
          email: acc.email,
          role: data?.data?.user?.role || data?.user?.role,
          isVerified: data?.data?.user?.isVerified || data?.user?.isVerified,
          hasAccessToken: Boolean(data?.data?.accessToken || data?.accessToken),
        });
      } else {
        console.error(`❌ [${acc.role}] Login FAILED (status ${res.status}):`, data);
      }
    } catch (err) {
      console.error(`❌ [${acc.role}] Request error:`, err.message);
    }
  }
}

testLogins();
