async function testBooking() {
  // 1. Login as patient
  const loginRes = await fetch('http://localhost:5100/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: 'patient@shebamitro.health',
      password: 'Password123!',
    }),
  });
  const loginData = await loginRes.json();
  const token = loginData.data?.accessToken;
  console.log('Patient logged in, token acquired:', Boolean(token));

  // 2. Fetch doctors
  const docRes = await fetch('http://localhost:5100/api/v1/doctors');
  const docData = await docRes.json();
  const firstDoc = docData.data?.items?.[0];
  const slot = firstDoc?.availability?.[0]?.slots?.[0];
  console.log('Booking with doctor:', firstDoc?.name, 'slot:', slot?.time, slot?.startTimeIso);

  // 3. Create appointment
  const bookRes = await fetch('http://localhost:5100/api/v1/appointments', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      doctorId: firstDoc.id,
      slotStartTime: slot.startTimeIso,
      slotEndTime: slot.endTimeIso,
      type: 'CHAMBER',
      notes: 'Chamber: ' + firstDoc.chambers[0].name,
    }),
  });
  const bookData = await bookRes.json();
  console.log('Booking response:', JSON.stringify(bookData, null, 2));
}

testBooking().catch(console.error);
