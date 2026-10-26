import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdminSubmissions from '../pages/AdminSubmissions';
import { courseService } from '../services/courseService';
import { studentsService } from '../services/studentsService';

const fetchSubmissions = vi.hoisted(() => vi.fn());
vi.mock('../context/useAuth', () => ({useAuth: () => ({user:{id:'reviewer'}})}));
vi.mock('../context/DataContext', () => ({useData: () => ({
  submissions:[],submissionsLoading:false,submissionsError:null,fetchSubmissions,
})}));
vi.mock('../services/courseService', () => ({courseService:{fetchCourses:vi.fn(),fetchCourseMembers:vi.fn()}}));
vi.mock('../services/studentsService', () => ({studentsService:{getAll:vi.fn()}}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(courseService.fetchCourses).mockResolvedValue([{id:'course',title:'Contracts',courseCode:'RBAC'}]);
  vi.mocked(studentsService.getAll).mockResolvedValue({students:[],pagination:{page:1,limit:500,total:0,totalPages:0}});
});
describe('explicit learner membership in submission review', () => {
  it('includes staff learners and revoked learner history without using display roles', async () => {
    vi.mocked(courseService.fetchCourseMembers).mockResolvedValue([
      {id:'staff',name:'Staff learner',email:'staff@invalid.test',studentId:'s-staff',rbacRoles:['instructor','student']},
      {id:'revoked',name:'Historical learner',email:'old@invalid.test',studentId:'s-old',rbacRoles:[]},
      {id:'display',name:'No learner profile',email:'display@invalid.test',studentId:null,rbacRoles:['student']},
    ]);
    render(<AdminSubmissions />);
    await userEvent.click(await screen.findByRole('button',{name:'RBAC'}));
    expect(await screen.findByText('Staff learner')).toBeInTheDocument();
    expect(screen.getByText('Historical learner')).toBeInTheDocument();
    expect(screen.queryByText('No learner profile')).not.toBeInTheDocument();
  });
  it('uses learner-profile IDs on a Step 2 backend without roster membership metadata', async () => {
    vi.mocked(studentsService.getAll).mockResolvedValue({
      students:[{id:'s-old',userId:'old',name:'Compatibility learner',email:'old@invalid.test',enrollmentNumber:'old',department:'Test',semester:1,createdAt:'2026-01-01'}],
      pagination:{page:1,limit:500,total:1,totalPages:1},
    });
    vi.mocked(courseService.fetchCourseMembers).mockResolvedValue([{id:'old',name:'Compatibility learner',email:'old@invalid.test',rbacRoles:['instructor']}]);
    render(<AdminSubmissions />);
    await userEvent.click(await screen.findByRole('button',{name:'RBAC'}));
    await waitFor(()=>expect(screen.getByText('Compatibility learner')).toBeInTheDocument());
  });
});
