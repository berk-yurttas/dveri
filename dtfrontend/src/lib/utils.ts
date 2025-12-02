import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export interface AccessControlEntity {
  allowed_departments?: string[];
  allowed_users?: string[];
  [key: string]: any;
}

export interface AccessControlUser {
  username: string;
  department: string;
  [key: string]: any;
}

export function checkAccess(entity: AccessControlEntity, user: AccessControlUser | null): boolean {
    // If no restrictions, allow access
    if ((!entity.allowed_departments || entity.allowed_departments.length === 0) && 
        (!entity.allowed_users || entity.allowed_users.length === 0)) {
      return true;
    }

    if (user?.role.includes('miras:admin')) {
      return true;
    }

    if (!user) return false;

    // Check user permission
    if (entity.allowed_users?.includes(user.username)) {
      return true;
    }

    // Check department permission
    if (entity.allowed_departments && entity.allowed_departments.length > 0 && user.department) {
      // Check exact match or if user's department is a child of an allowed department
      return entity.allowed_departments.some(allowed => 
        user.department === allowed || user.department.startsWith(allowed + '_')
      );
    }

    return false;
}
