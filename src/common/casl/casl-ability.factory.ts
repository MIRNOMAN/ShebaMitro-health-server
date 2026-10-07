import { Injectable } from '@nestjs/common';
import { AbilityBuilder, createMongoAbility, MongoAbility } from '@casl/ability';
import { Role } from '@prisma/client';

export enum Action {
  MANAGE = 'manage',
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  BOOK_APPOINTMENT = 'book_appointment',
  VIEW_PRESCRIPTION = 'view_prescription',
  MANAGE_REMINDERS = 'manage_reminders',
}

export type Subjects =
  | 'FamilyMember'
  | 'Appointment'
  | 'Prescription'
  | 'MedicineReminder'
  | 'all';

export type AppAbility = MongoAbility<[Action, Subjects]>;

export interface UserSubject {
  id: string;
  role: string;
  patientProfileId?: string | null;
}

@Injectable()
export class CaslAbilityFactory {
  createForUser(user: UserSubject): AppAbility {
    const { can, cannot, build } = new AbilityBuilder<AppAbility>(createMongoAbility);

    if (user.role === Role.ADMIN) {
      can(Action.MANAGE, 'all');
    } else if (user.role === Role.PATIENT) {
      // 1. Primary account holder can manage dependent family members owned by primaryUserId
      can(Action.MANAGE, 'FamilyMember');
      can(Action.CREATE, 'FamilyMember');
      can(Action.READ, 'FamilyMember');
      can(Action.UPDATE, 'FamilyMember');
      can(Action.DELETE, 'FamilyMember');

      // 2. Primary account holder can book appointments on behalf of self & family members
      can(Action.BOOK_APPOINTMENT, 'Appointment');
      can(Action.READ, 'Appointment');

      // 3. Primary account holder can view prescriptions of dependent family members
      can(Action.VIEW_PRESCRIPTION, 'Prescription');
      can(Action.READ, 'Prescription');

      // 4. Primary account holder can receive/manage independent medicine reminders for family members
      can(Action.MANAGE_REMINDERS, 'MedicineReminder');
      can(Action.READ, 'MedicineReminder');
      can(Action.CREATE, 'MedicineReminder');
    } else if (user.role === Role.DOCTOR) {
      can(Action.READ, 'FamilyMember');
      can(Action.READ, 'Appointment');
      can(Action.READ, 'Prescription');
      can(Action.CREATE, 'Prescription');
      can(Action.READ, 'MedicineReminder');
    } else {
      can(Action.READ, 'all');
    }

    return build();
  }
}
