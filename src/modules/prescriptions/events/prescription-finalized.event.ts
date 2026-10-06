export class PrescriptionFinalizedEvent {
  constructor(
    public readonly prescriptionId: string,
    public readonly appointmentId: string,
    public readonly doctorId: string,
    public readonly patientId: string,
    public readonly createdAt: Date,
    public readonly prescription: any,
  ) {}
}
