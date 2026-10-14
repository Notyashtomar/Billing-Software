export interface Admin {
  id: string;
  userid: string;
  password: string;
  role: string;
}

import { DEPARTMENT_OPTIONS } from './org-structure-options';

export interface Department {
  id: string;
  name: string;
}

export interface DepartmentUser {
  id: string;
  userid: string;
  username: string;
  useremail: string;
  user_role: string;
  department_id: string;
}

export const mockAdmins: Admin[] = [
  { id: '1', userid: 'superadmin', password: 'admin123', role: 'superadmin' },
  { id: '2', userid: 'admin1', password: 'admin123', role: 'manager' },
];

export const mockDepartments: Department[] = DEPARTMENT_OPTIONS.map((name, index) => ({
  id: `dept-${index + 1}`,
  name,
}));

export const mockUsers: DepartmentUser[] = [
  {
    id: 'user-1',
    userid: 'eng001',
    username: 'John Doe',
    useremail: 'john.doe@company.com',
    user_role: 'Developer',
    department_id: 'dept-1',
  },
  {
    id: 'user-2',
    userid: 'eng002',
    username: 'Jane Smith',
    useremail: 'jane.smith@company.com',
    user_role: 'Senior Developer',
    department_id: 'dept-1',
  },
  {
    id: 'user-3',
    userid: 'eng003',
    username: 'Michael Johnson',
    useremail: 'michael.j@company.com',
    user_role: 'Tech Lead',
    department_id: 'dept-1',
  },
  {
    id: 'user-4',
    userid: 'mkt001',
    username: 'Bob Johnson',
    useremail: 'bob.johnson@company.com',
    user_role: 'Marketing Manager',
    department_id: 'dept-2',
  },
  {
    id: 'user-5',
    userid: 'mkt002',
    username: 'Sarah Williams',
    useremail: 'sarah.w@company.com',
    user_role: 'Content Strategist',
    department_id: 'dept-2',
  },
  {
    id: 'user-6',
    userid: 'sales001',
    username: 'Alice Brown',
    useremail: 'alice.brown@company.com',
    user_role: 'Sales Representative',
    department_id: 'dept-3',
  },
  {
    id: 'user-7',
    userid: 'sales002',
    username: 'David Miller',
    useremail: 'david.m@company.com',
    user_role: 'Sales Manager',
    department_id: 'dept-3',
  },
  {
    id: 'user-8',
    userid: 'hr001',
    username: 'Emily Davis',
    useremail: 'emily.d@company.com',
    user_role: 'HR Manager',
    department_id: 'dept-4',
  },
  {
    id: 'user-9',
    userid: 'fin001',
    username: 'Robert Wilson',
    useremail: 'robert.w@company.com',
    user_role: 'Financial Analyst',
    department_id: 'dept-5',
  },
  {
    id: 'user-10',
    userid: 'fin002',
    username: 'Lisa Anderson',
    useremail: 'lisa.a@company.com',
    user_role: 'Accountant',
    department_id: 'dept-5',
  },
];

let usersData = [...mockUsers];

export const getUsers = (): DepartmentUser[] => {
  return [...usersData];
};

export const getUserById = (id: string): DepartmentUser | undefined => {
  return usersData.find(user => user.id === id);
};

export const getUsersByDepartment = (departmentId: string): DepartmentUser[] => {
  return usersData.filter(user => user.department_id === departmentId);
};

export const updateUser = (id: string, data: Partial<DepartmentUser>): boolean => {
  const index = usersData.findIndex(user => user.id === id);
  if (index !== -1) {
    usersData[index] = { ...usersData[index], ...data };
    if (typeof window !== 'undefined') {
      localStorage.setItem('departmentUsers', JSON.stringify(usersData));
    }
    return true;
  }
  return false;
};

export const createUser = (data: Omit<DepartmentUser, 'id'>): DepartmentUser => {
  const newUser: DepartmentUser = {
    id: `user-${Date.now()}`,
    ...data,
  };
  usersData.push(newUser);
  if (typeof window !== 'undefined') {
    localStorage.setItem('departmentUsers', JSON.stringify(usersData));
  }
  return newUser;
};

export const deleteUser = (id: string): boolean => {
  const initialLength = usersData.length;
  usersData = usersData.filter(user => user.id !== id);
  if (usersData.length < initialLength) {
    if (typeof window !== 'undefined') {
      localStorage.setItem('departmentUsers', JSON.stringify(usersData));
    }
    return true;
  }
  return false;
};

export const initializeLocalStorage = () => {
  if (typeof window !== 'undefined') {
    const stored = localStorage.getItem('departmentUsers');
    if (stored) {
      usersData = JSON.parse(stored);
    } else {
      localStorage.setItem('departmentUsers', JSON.stringify(mockUsers));
    }
  }
};
