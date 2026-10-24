import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react-native';
import CourseScreen from '@/app/(student)/course';
import { courseService } from '@/services/courseService';
import { courseCompletionService } from '@/services/courseCompletionService';
import { getCourseWeeks } from '@/types/course';

jest.mock('@/services/courseService');
jest.spyOn(courseCompletionService,'getLessonCompletions');
jest.spyOn(courseCompletionService,'markLessonComplete');
jest.spyOn(courseCompletionService,'updateProgress');
jest.mock('@/components/MaterialViewer',()=>{ const {Text,Pressable}=require('react-native'); return {MaterialViewer:(props:any)=><>
  <Text>Viewing {props.item.title}</Text>
  <Text>Resume: {props.progress?.lastPositionS ?? 0}</Text>
  <Pressable onPress={props.onComplete}><Text>Complete lesson</Text></Pressable>
  <Pressable onPress={props.onClose}><Text>Back to materials</Text></Pressable>
</>};});
const mockCourse=courseService as jest.Mocked<typeof courseService>;
const mockProgress=courseCompletionService as jest.Mocked<typeof courseCompletionService>;
const course={id:'c',title:'Learning',weeks:[
  {id:'w2',title:'Practice week',order:2,sections:[{id:'s2',title:'Practice section',items:[{id:'assignment',title:'Practice work',type:'assignment' as const}]}]},
  {id:'w1',title:'Foundations week',order:1,sections:[{id:'s1',title:'Learn',items:[{id:'audio',title:'Listen',type:'audio' as const,url:'https://example.com/a.mp3'}]}]},
]};
beforeEach(()=>{jest.clearAllMocks();mockCourse.fetchCourses.mockResolvedValue([{...course,weeks:getCourseWeeks(course)}]);mockProgress.markLessonComplete.mockResolvedValue(undefined);mockProgress.getLessonCompletions.mockResolvedValue([{itemId:'audio',completedAt:null,progressPct:30,lastPositionS:45}]);});

describe('course weeks and restored progress',()=>{
  it('opens the first ordered week, switches to the next, and does not refetch on selection',async()=>{
    render(<CourseScreen/>);
    await waitFor(()=>expect(screen.getByText('Listen')).toBeTruthy());
    await waitFor(()=>expect(screen.getByText('30% in progress')).toBeTruthy());
    fireEvent.press(screen.getByText('Practice week'));
    expect(screen.getByText('Practice work')).toBeTruthy();
    expect(screen.queryByText('Listen')).toBeNull();
    expect(mockCourse.fetchCourses).toHaveBeenCalledTimes(1);
  });
  it('waits for server progress and passes the saved resume cursor to the lesson',async()=>{
    render(<CourseScreen/>);
    await waitFor(()=>expect(screen.getByText('Listen')).toBeTruthy());
    fireEvent.press(screen.getByText('Listen'));
    await waitFor(()=>expect(screen.getByText('Resume: 45')).toBeTruthy());
    expect(mockProgress.getLessonCompletions).toHaveBeenCalledWith('c');
    await act(async()=>{fireEvent.press(screen.getByText('Back to materials'));});
    expect(screen.getByText('Foundations week')).toBeTruthy();
  });
  it('shows a retryable progress read failure before opening playback',async()=>{
    mockProgress.getLessonCompletions.mockRejectedValueOnce(new Error('Cannot load progress'));
    render(<CourseScreen/>);
    await waitFor(()=>expect(screen.getByText('Cannot load progress')).toBeTruthy());
    fireEvent.press(screen.getByText('Listen'));
    expect(screen.queryByText('Viewing Listen')).toBeNull();
    fireEvent.press(screen.getByText('Try again'));
    await waitFor(()=>expect(screen.getByText('Resume: 45')).toBeTruthy());
  });
  it('does not show a failed write as complete and retries it without losing the lesson',async()=>{
    mockProgress.markLessonComplete.mockRejectedValueOnce(new Error('Completion offline'));
    render(<CourseScreen/>);
    await waitFor(()=>expect(screen.getByText('30% in progress')).toBeTruthy());
    fireEvent.press(screen.getByText('Listen'));
    await waitFor(()=>expect(screen.getByText('Complete lesson')).toBeTruthy());
    await act(async()=>{fireEvent.press(screen.getByText('Complete lesson'));});
    await waitFor(()=>expect(screen.getByText('Completion offline')).toBeTruthy());
    mockProgress.getLessonCompletions.mockResolvedValue([{itemId:'audio',completedAt:'now',progressPct:100,lastPositionS:45}]);
    await act(async()=>{fireEvent.press(screen.getByText('Try again')); await new Promise((resolve)=>setTimeout(resolve,0));});
    expect(mockProgress.markLessonComplete).toHaveBeenCalledTimes(2);
    await waitFor(()=>expect(screen.queryByText('Completion offline')).toBeNull());
    await act(async()=>{fireEvent.press(screen.getByText('Back to materials'));});
    await waitFor(()=>expect(screen.getByText('Completed')).toBeTruthy());
    expect(mockProgress.markLessonComplete).toHaveBeenCalledTimes(2);
  });

});
