import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import StudentCourse from '../pages/StudentCourse';
import InlineAssignmentForm from '../components/InlineAssignmentForm';

const mocks = vi.hoisted(() => ({ courses:vi.fn(),completions:vi.fn(),complete:vi.fn(),submit:vi.fn(),user:{id:'learning-user'} }));
vi.mock('../context/useAuth',()=>({useAuth:()=>({user:mocks.user})}));
vi.mock('../services/courseService',()=>({courseService:{fetchCourses:mocks.courses}}));
vi.mock('../services/courseCompletionService',()=>({courseCompletionService:{getLessonCompletions:mocks.completions,markLessonComplete:mocks.complete}}));
vi.mock('../services/submissionsService',()=>({submissionsService:{create:mocks.submit}}));
vi.mock('../components/EmbeddedMaterialViewer',()=>({EmbeddedMaterialViewer:({item}:{item:{title:string}})=><p>Viewing {item.title}</p>}));

const course={id:'course',title:'Learning parity',weeks:[{id:'week',title:'Week 1',sections:[{id:'section',title:'Lessons',items:[
  {id:'audio',title:'Listening',type:'audio',url:'https://example.com/a.mp3'},
  {id:'quiz',title:'Assessment',type:'quiz',quizId:'q'},
  {id:'assignment',title:'Work',type:'assignment'},
]}]}]};
beforeEach(()=>{
  vi.clearAllMocks();localStorage.clear();mocks.courses.mockResolvedValue([course]);mocks.complete.mockResolvedValue(undefined);mocks.submit.mockResolvedValue({id:'submission'});
  mocks.completions.mockResolvedValue([{itemId:'audio',completedAt:null,progressPct:30,lastPositionS:45}]);
});
function openCourse(){return render(<MemoryRouter initialEntries={['/student/course?course=course&week=week']}><StudentCourse/></MemoryRouter>);}

describe('A12 — shared completion state on web',()=>{
  it('does not display a native playback-only record as a completed lesson',async()=>{
    localStorage.setItem('lms:courseItemDone:learning-user:course',JSON.stringify(['audio']));
    openCourse();
    await waitFor(()=>expect(mocks.completions).toHaveBeenCalledWith('course'));
    await waitFor(()=>expect(screen.getByText('0 of 3 marked done')).toBeInTheDocument());
    expect(screen.getAllByLabelText('Assessment pending')).toHaveLength(2);
  });
  it('removes stale local assessment checks and opens assessments without manually completing them',async()=>{
    localStorage.setItem('lms:courseItemDone:learning-user:course',JSON.stringify(['quiz','assignment']));
    openCourse();
    await waitFor(()=>expect(screen.getByText('0 of 3 marked done')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Assessment'));
    expect(screen.getByText('Viewing Assessment')).toBeInTheDocument();
    expect(mocks.complete).not.toHaveBeenCalled();
  });
  it('shows the server assessment result as completed',async()=>{
    mocks.completions.mockResolvedValue([{itemId:'quiz',completedAt:'2026-10-22',progressPct:100,lastPositionS:null}]);
    openCourse();
    await waitFor(()=>expect(screen.getByText('1 of 3 marked done')).toBeInTheDocument());
    expect(screen.getByLabelText('Assessment complete')).toBeInTheDocument();
  });
  it('web assignment upload includes a nonempty description accepted by the API',async()=>{
    render(<InlineAssignmentForm courseId="course" weekId="week" itemId="assignment"/>);
    await userEvent.type(screen.getByLabelText('Submission title'),'My work');
    await userEvent.upload(screen.getByLabelText('Upload file'),new File(['work'],'work.txt',{type:'text/plain'}));
    await userEvent.click(screen.getByRole('button',{name:'Submit assignment'}));
    await waitFor(()=>expect(mocks.submit).toHaveBeenCalledWith(expect.objectContaining({courseId:'course',weekId:'week',itemId:'assignment',description:'Assignment: My work'})));
  });
});
