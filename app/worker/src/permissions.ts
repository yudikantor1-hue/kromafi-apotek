import type { SessionStaff } from './auth';

export type Permission = 'items:read' | 'items:write' | 'audit:read' | 'staff:read' | 'staff:write';

// Any active staff member maintains Barang and can see the staff list;
// account changes and audit history stay with admins.
const MATRIX: Record<SessionStaff['role'], Permission[]> = {
  admin: ['items:read', 'items:write', 'audit:read', 'staff:read', 'staff:write'],
  staf: ['items:read', 'items:write', 'staff:read'],
};

export function roleAllows(role: SessionStaff['role'], permission: Permission): boolean {
  return MATRIX[role].includes(permission);
}

export function can(staff: SessionStaff, permission: Permission): boolean {
  return staff.status === 'Aktif' && roleAllows(staff.role, permission);
}
