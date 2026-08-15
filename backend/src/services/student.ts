import type { TxClient } from '../lib/db.js';

export async function createStudent(
  tx: TxClient,
  parentId: string,
  data: { name: string; dateOfBirth: string; notes?: string },
) {
  return tx.student.create({
    data: {
      parentId,
      name: data.name,
      dateOfBirth: new Date(data.dateOfBirth),
      notes: data.notes ?? null,
    },
  });
}

export async function updateStudent(
  tx: TxClient,
  studentId: string,
  data: { name?: string; dateOfBirth?: string; notes?: string | null },
) {
  return tx.student.update({
    where: { id: studentId },
    data: {
      ...(data.name !== undefined && { name: data.name }),
      ...(data.dateOfBirth !== undefined && {
        dateOfBirth: new Date(data.dateOfBirth),
      }),
      ...(data.notes !== undefined && { notes: data.notes }),
    },
  });
}
