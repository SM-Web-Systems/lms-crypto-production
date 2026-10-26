import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RoleBadges } from '../components/RoleBadges';
import { currentSessionUser, rolesText } from '../utils/rolePresentation';
import { canAccessPath, homeForUser } from '../utils/authorization';
import type { User } from '../types/api';

describe('RBAC Step 3 client presentation', () => {
  it('shows multiple exact custom labels without a single legacy field', () => {
    render(<RoleBadges subject={{ roleSummaries: [
      {id:'student',name:'student',label:'Student'},
      {id:'custom',name:'admin-adviser',label:'Adviser'},
    ] }} />);
    expect(screen.getByText('Student')).toBeInTheDocument();
    expect(screen.getByText('Adviser')).toBeInTheDocument();
  });
  it('does not invent student/admin membership from a stale compatibility label', () => {
    const stale: User & {role: string} = {id:'u',name:'User',email:'u@test.invalid',role:'admin',walletAddress:null,walletLinkingStatus:'none',roleSummaries:[],permissions:[],workspaces:[]};
    expect(rolesText(stale)).toBe('No roles assigned');
    expect(currentSessionUser(stale)).not.toHaveProperty('role');
    expect(homeForUser(stale)).toBe('/access-denied');
    expect(canAccessPath(stale,'/admin/users')).toBe(false);
  });
  it('uses exact RBAC names from transitional Step 2 servers, never substring mapping', () => {
    expect(rolesText({rbacRoles:['instructor','guardian-adviser']})).toBe('instructor, guardian-adviser');
    expect(rolesText({roleSummaries:[],rbacRoles:['admin']})).toBe('No roles assigned');
  });
});
