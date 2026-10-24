import React from 'react';
import { AppState } from 'react-native';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react-native';
import { LessonVideo, LessonAudio } from '@/components/LessonMedia';
import { LessonYouTube } from '@/components/LessonYouTube';

const mockListeners: Record<string,(data?:any)=>void> = {};
const mockVideo={loop:false,timeUpdateEventInterval:0,duration:100,currentTime:0,pause:jest.fn(),addListener:jest.fn((event,listener)=>{mockListeners[event]=listener;return{remove:jest.fn()};})};
const mockAudio={play:jest.fn(),pause:jest.fn(),seekTo:jest.fn().mockResolvedValue(undefined)};
let mockStatus={isLoaded:true,currentTime:0,duration:100,playing:false,didJustFinish:false,playbackState:'ready'};
jest.mock('expo-video',()=>({useVideoPlayer:(_url:unknown,setup:(p:unknown)=>void)=>{setup(mockVideo);return mockVideo;},VideoView:'VideoView'}));
jest.mock('expo-audio',()=>({useAudioPlayer:()=>mockAudio,useAudioPlayerStatus:()=>mockStatus}));
jest.mock('react-native-webview',()=>({WebView:'WebView'}));
const onProgress=jest.fn(), onComplete=jest.fn();
beforeEach(()=>{jest.clearAllMocks();jest.spyOn(AppState,'addEventListener').mockReturnValue({remove:jest.fn()});mockVideo.currentTime=0;mockStatus={isLoaded:true,currentTime:0,duration:100,playing:false,didJustFinish:false,playbackState:'ready'};});

describe('native playback tracking',()=>{
  it('restores direct video position, saves samples and completes on playback end',()=>{
    render(<LessonVideo url="https://example.com/video.mp4" initialPosition={35} onProgress={onProgress} onComplete={onComplete}/>);
    expect(mockVideo.currentTime).toBe(35);
    act(()=>mockListeners.timeUpdate({currentTime:45}));
    expect(onProgress).toHaveBeenCalledWith(45,45);
    expect(onComplete).not.toHaveBeenCalled();
    act(()=>mockListeners.playToEnd());
    expect(onProgress).toHaveBeenCalledWith(100,100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
  it('saves the current cursor on pause and flushes the last sample on unmount',()=>{
    const {unmount}=render(<LessonVideo url="https://example.com/video.mp4" onProgress={onProgress} onComplete={onComplete}/>);
    mockVideo.currentTime=25;
    act(()=>mockListeners.playingChange({isPlaying:false}));
    expect(onProgress).toHaveBeenLastCalledWith(25,25);
    unmount();
    expect(onProgress).toHaveBeenLastCalledWith(25,25);
  });
  it('reports video errors and pauses when the app backgrounds',()=>{
    const listener=jest.spyOn(AppState,'addEventListener');
    render(<LessonVideo url="https://example.com/video.mp4" onProgress={onProgress} onComplete={onComplete}/>);
    act(()=>mockListeners.statusChange({status:'error'}));
    expect(screen.getByText(/Could not play this video/)).toBeTruthy();
    act(()=>listener.mock.calls[listener.mock.calls.length-1][1]('background'));
    expect(mockVideo.pause).toHaveBeenCalled();
    listener.mockRestore();
  });
  it('restores native audio, exposes playback controls and completes only at the end',async()=>{
    const {rerender}=render(<LessonAudio url="https://example.com/audio.mp3" initialPosition={30} onProgress={onProgress} onComplete={onComplete}/>);
    await waitFor(()=>expect(mockAudio.seekTo).toHaveBeenCalledWith(30));
    expect(onProgress).not.toHaveBeenCalled();
    fireEvent.press(screen.getByText('Play audio'));
    expect(mockAudio.play).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
    mockStatus={...mockStatus,currentTime:100,didJustFinish:true};
    rerender(<LessonAudio url="https://example.com/audio.mp3" initialPosition={30} onProgress={onProgress} onComplete={onComplete}/>);
    expect(onProgress).toHaveBeenCalledWith(100,100);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
  it('validates embedded playback messages and resumes YouTube from the saved position',()=>{
    const {UNSAFE_getByType}=render(<LessonYouTube url="https://youtu.be/abcdefghijk" initialPosition={42} onProgress={onProgress} onComplete={onComplete}/>);
    const view=UNSAFE_getByType('WebView' as never);
    expect(view.props.source.html).toContain('start:42');
    act(()=>view.props.onMessage({nativeEvent:{data:JSON.stringify({position:50,duration:100})}}));
    expect(onProgress).toHaveBeenCalledWith(50,50);
    act(()=>view.props.onMessage({nativeEvent:{data:'{"position":-1,"duration":0}'}}));
    expect(onProgress).toHaveBeenCalledTimes(1);
    act(()=>view.props.onMessage({nativeEvent:{data:JSON.stringify({position:100,duration:100,ended:true})}}));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});
