import React from 'react';
import { Linking } from 'react-native';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { MaterialViewer } from '@/components/MaterialViewer';
import { LessonQuiz } from '@/components/LessonQuiz';
import { LessonAssignment } from '@/components/LessonAssignment';
import { quizService } from '@/services/quizService';
import { submissionsService } from '@/services/submissionsService';
import { documentsService } from '@/services/documentsService';
import * as DocumentPicker from 'expo-document-picker';
import type { CourseItem } from '@/types/course';

jest.mock('@/services/quizService');
jest.mock('@/services/submissionsService');
jest.mock('@/services/documentsService');
jest.mock('@/lib/api',()=>({getAuthToken:jest.fn().mockResolvedValue('test-token')}));
jest.mock('expo-document-picker',()=>({getDocumentAsync:jest.fn()}));
jest.mock('react-native-webview',()=>({WebView:'WebView'}));
jest.mock('@/components/LessonMedia',()=>({LessonVideo:()=>null,LessonAudio:()=>null}));
const mockQuiz=quizService as jest.Mocked<typeof quizService>;
const mockSubmissions=submissionsService as jest.Mocked<typeof submissionsService>;
const mockDocuments=documentsService as jest.Mocked<typeof documentsService>;
const section={id:'s',title:'Section',items:[]};
const itemBase={id:'i',title:'Lesson'};
const onComplete=jest.fn().mockResolvedValue(undefined);
const onSubmitted=jest.fn();
const props={section,courseId:'course',weekId:'week-2',onClose:jest.fn(),onComplete,onProgress:jest.fn(),onAssessmentSubmitted:onSubmitted};
beforeEach(()=>{
  jest.clearAllMocks();
  mockSubmissions.getAll.mockResolvedValue({submissions:[],pagination:{page:1,limit:100,total:0,totalPages:1}});
});

describe('MaterialViewer content dispatch and errors',()=>{
  it.each([
    {type:'link',url:'https://example.com',label:'Open link'},
    {type:'text',url:'https://example.com/notes.md',label:'Open reading'},
    {type:'video',url:'https://example.com/video.mp4',label:'Open video'},
    {type:'audio',url:'https://example.com/audio.mp3',downloadUrl:'https://example.com/audio.mp3',label:'Download audio'},
    {type:'pdf',fileUrl:'https://example.com/notes.pdf',label:'Download PDF'},
    {type:'download',fileUrl:'https://example.com/work.zip',fileName:'work.zip',label:'Download file'},
  ])('renders an action for $type and allows completion',async({label,...item})=>{
    render(<MaterialViewer {...props} item={{...itemBase,...item} as CourseItem}/>);
    expect(screen.getByText(label)).toBeTruthy();
    fireEvent.press(screen.getByText('Mark lesson complete'));
    await waitFor(()=>expect(onComplete).toHaveBeenCalledTimes(1));
  });
  it('shows missing and unsupported lessons instead of an empty viewer',()=>{
    const {rerender}=render(<MaterialViewer {...props} item={{...itemBase,type:'unsupported',originalType:'simulation'}}/>);
    expect(screen.getByText(/simulation.*not supported/)).toBeTruthy();
    expect(screen.queryByText('Mark lesson complete')).toBeNull();
    rerender(<MaterialViewer {...props} item={{...itemBase,type:'pdf'}}/>);
    expect(screen.getByText(/not been configured yet/)).toBeTruthy();
  });
  it('reports external open failures and does not complete on a failed open',async()=>{
    jest.spyOn(Linking,'openURL').mockRejectedValueOnce(new Error('Cannot open this link'));
    render(<MaterialViewer {...props} item={{...itemBase,type:'link',url:'https://example.com'}}/>);
    fireEvent.press(screen.getByText('Open link'));
    await waitFor(()=>expect(screen.getByText('Cannot open this link')).toBeTruthy());
    expect(onComplete).not.toHaveBeenCalled();
  });
  it('uses authenticated document download and exposes download failures',async()=>{
    mockDocuments.download.mockRejectedValueOnce(new Error('Download failed'));
    render(<MaterialViewer {...props} item={{...itemBase,type:'pdf',documentId:'document'}}/>);
    fireEvent.press(screen.getByText('Download PDF'));
    await waitFor(()=>expect(screen.getByText('Download failed')).toBeTruthy());
    expect(mockDocuments.download).toHaveBeenCalledWith('document','i.pdf');
  });
  it('does not show a manual completion control for assessments',async()=>{
    mockQuiz.getById.mockResolvedValue(null);
    const {rerender}=render(<MaterialViewer {...props} item={{...itemBase,type:'quiz',quizId:'q'}}/>);
    await waitFor(()=>expect(screen.getByText(/unavailable/)).toBeTruthy());
    expect(screen.queryByText('Mark lesson complete')).toBeNull();
    rerender(<MaterialViewer {...props} item={{...itemBase,type:'assignment'}}/>);
    await waitFor(()=>expect(screen.getByText('Submit assignment')).toBeTruthy());
    expect(screen.queryByText('Mark lesson complete')).toBeNull();
  });
});

describe('lesson-linked assessments',()=>{
  it('takes the exact lesson quiz and refreshes server completion after submitting',async()=>{
    mockQuiz.getById.mockResolvedValue({id:'quiz',courseId:'course',title:'Exact lesson quiz',createdAt:'now',passingScore:70,questions:[{id:'question',type:'multiple_choice',question:'Pick A',options:['A','B'],order:1}]});
    mockQuiz.submitQuiz.mockResolvedValue({id:'result',quizId:'quiz',userId:'u',score:100,total:100,passed:true,answers:{question:'A'},completedAt:'now'});
    render(<LessonQuiz quizId="quiz" courseId="course" onSubmitted={onSubmitted}/>);
    await waitFor(()=>expect(screen.getByText('Exact lesson quiz')).toBeTruthy());
    fireEvent.press(screen.getByText('A'));
    fireEvent.press(screen.getByText('Submit quiz'));
    await waitFor(()=>expect(screen.getByText(/You passed/)).toBeTruthy());
    expect(mockQuiz.submitQuiz).toHaveBeenCalledWith('quiz',{question:'A'});
    expect(onSubmitted).toHaveBeenCalledTimes(1);
    expect(onComplete).not.toHaveBeenCalled();
  });
  it('retains answers after a failed quiz submission for retry',async()=>{
    mockQuiz.getById.mockResolvedValue({id:'quiz',courseId:'course',title:'Quiz',createdAt:'now',questions:[{id:'question',type:'multiple_choice',question:'Pick A',options:['A'],order:1}]});
    mockQuiz.submitQuiz.mockRejectedValueOnce(new Error('Offline'));
    render(<LessonQuiz quizId="quiz" courseId="course" onSubmitted={onSubmitted}/>);
    await waitFor(()=>expect(screen.getByText('A')).toBeTruthy());
    fireEvent.press(screen.getByText('A'));fireEvent.press(screen.getByText('Submit quiz'));
    await waitFor(()=>expect(screen.getByText('Offline')).toBeTruthy());
    expect(screen.getByRole('radio').props.accessibilityState.checked).toBe(true);
    expect(onSubmitted).not.toHaveBeenCalled();
  });
  it('filters submissions to this lesson and preserves course, week and item on upload',async()=>{
    mockSubmissions.getAll.mockResolvedValue({submissions:[{id:'old',itemId:'other',title:'Other lesson'} as never],pagination:{page:1,limit:100,total:1,totalPages:1}});
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({canceled:false,assets:[{uri:'file:///work.txt',name:'work.txt',mimeType:'text/plain',size:4}]});
    mockSubmissions.create.mockResolvedValue({id:'new',title:'Assignment',itemId:'assignment',status:'pending'} as never);
    render(<LessonAssignment courseId="course" weekId="week-2" item={{id:'assignment',type:'assignment',title:'Assignment',maxFileSize:10,allowedMimeTypes:['text/plain']}} onSubmitted={onSubmitted}/>);
    await waitFor(()=>expect(mockSubmissions.getAll).toHaveBeenCalledWith({courseId:'course',view:'own',page:1,limit:100}));
    expect(screen.queryByText(/Other lesson/)).toBeNull();
    fireEvent.press(screen.getByText('Choose assignment file'));
    await waitFor(()=>expect(screen.getByText('work.txt')).toBeTruthy());
    fireEvent.press(screen.getByText('Submit assignment'));
    await waitFor(()=>expect(mockSubmissions.create).toHaveBeenCalledWith(expect.objectContaining({courseId:'course',weekId:'week-2',itemId:'assignment',description:'Assignment: Assignment'})));
    await waitFor(()=>expect(screen.getByText(/Assignment · pending/)).toBeTruthy());
    expect(onComplete).not.toHaveBeenCalled();
  });
  it('rejects an oversized assignment file before upload',async()=>{
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({canceled:false,assets:[{uri:'file:///large.txt',name:'large.txt',mimeType:'text/plain',size:100}]});
    render(<LessonAssignment courseId="course" item={{id:'assignment',type:'assignment',title:'Assignment',maxFileSize:10}} onSubmitted={onSubmitted}/>);
    await waitFor(()=>expect(mockSubmissions.getAll).toHaveBeenCalled());
    fireEvent.press(screen.getByText('Choose assignment file'));
    await waitFor(()=>expect(screen.getByText(/exceeds the assignment size limit/)).toBeTruthy());
    expect(mockSubmissions.create).not.toHaveBeenCalled();
  });
});
