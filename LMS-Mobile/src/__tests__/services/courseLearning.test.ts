import api from '@/lib/api';
import { courseService } from '@/services/courseService';
import { courseCompletionService, LessonProgressSync } from '@/services/courseCompletionService';
import { courseFromApi, isWebResource } from '@/utils/courseContent';
import { getCourseWeeks } from '@/types/course';
import { submissionsService } from '@/services/submissionsService';

jest.mock('@/lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
const get = api.get as jest.Mock, post = api.post as jest.Mock, put = api.put as jest.Mock;
const section = { id:'section', title:'Learn', items:[{ id:'notes', title:'Notes', type:'text', url:'https://example.com/notes.md' }] };
beforeEach(() => { jest.clearAllMocks(); post.mockResolvedValue({data:{success:true}}); put.mockResolvedValue({data:{success:true}}); });

describe('authored course contract', () => {
  it('preserves weeks, names, sections and item order without duplicating flattened sections', () => {
    const course=courseFromApi({id:'course',title:'Course',sections:[section],weeks:[
      {id:'w2',title:'Practice',order:2,sections:[section]},
      {id:'w1',title:'Foundations',order:1,sections:[{...section,items:[{...section.items[0],id:'second',order:2},{...section.items[0],id:'first',order:1}]}]},
    ]});
    const weeks=getCourseWeeks(course);
    expect(weeks.map((w)=>w.title)).toEqual(['Foundations','Practice']);
    expect(weeks[0].sections[0].items.map((i)=>i.id)).toEqual(['first','second']);
    expect(weeks).toHaveLength(2);
  });
  it('wraps legacy sections in Week 1 and tolerates malformed nested arrays', () => {
    expect(getCourseWeeks(courseFromApi({id:'c',title:'Legacy',sections:[section]}))[0]).toMatchObject({title:'Week 1',sections:[section]});
    expect(getCourseWeeks(courseFromApi({id:'c',title:'Invalid',weeks:[null,{id:'empty',sections:'bad'}]}))[0].sections).toEqual([]);
  });
  it('preserves all eight types and quiz, download and assignment associations', () => {
    const types=['video','link','pdf','text','audio','quiz','assignment','download'];
    const course=courseFromApi({id:'c',title:'All',sections:[{...section,items:types.map((type)=>({id:type,title:type,type,url:'https://example.com',quizId:'quiz-id',documentId:'doc',fileName:'file.pdf',maxFileSize:10,allowedMimeTypes:['text/plain',null]}))}]});
    const items=getCourseWeeks(course)[0].sections[0].items;
    expect(items.map((item)=>item.type)).toEqual(types);
    expect(items[5]).toMatchObject({quizId:'quiz-id'});
    expect(items[6]).toMatchObject({maxFileSize:10,allowedMimeTypes:['text/plain']});
    expect(items[7]).toMatchObject({documentId:'doc',fileName:'file.pdf'});
  });
  it('keeps future and invalid lesson types visible as unsupported items', () => {
    const course=courseFromApi({id:'c',title:'Future',sections:[{...section,items:[{id:'future',title:'Simulation',type:'simulation'},null]}]});
    expect(getCourseWeeks(course)[0].sections[0].items).toEqual([expect.objectContaining({id:'future',type:'unsupported',originalType:'simulation'}),expect.objectContaining({type:'unsupported'})]);
  });
  it('only accepts HTTP resource links', () => {
    expect(isWebResource('https://example.com')).toBe(true);
    for(const url of ['javascript:alert(1)','file:///secret','invalid','']) expect(isWebResource(url)).toBe(false);
  });
  it('requests enrolled courses and surfaces invalid API responses', async () => {
    get.mockResolvedValueOnce({data:{success:true,data:{courses:[{id:'c',title:'Course',sections:[section]}]}}});
    expect(await courseService.fetchCourses()).toHaveLength(1);
    expect(get).toHaveBeenCalledWith('/courses',{params:{access:'enrolled'}});
    get.mockResolvedValueOnce({data:{success:false}});
    await expect(courseService.fetchCourses()).rejects.toThrow('Could not load courses');
  });
});

describe('shared lesson completion API', () => {
  it('reads personal resume records even for a multi-role account', async () => {
    get.mockResolvedValueOnce({data:{success:true,data:{completions:[{item_id:'audio',completed_at:null,progress_pct:30,last_position_s:45}]}}});
    expect(await courseCompletionService.getLessonCompletions('course')).toEqual([{itemId:'audio',completedAt:null,progressPct:30,lastPositionS:45}]);
    expect(get).toHaveBeenCalledWith('/courses/course/lessons/completions',{params:{view:'own'}});
  });
  it('uses the same authenticated write paths and payloads as web', async () => {
    await courseCompletionService.updateProgress('c','i',45,30);
    await courseCompletionService.markLessonComplete('c','i');
    expect(put).toHaveBeenCalledWith('/courses/c/lessons/i/progress',{positionSeconds:45,progressPercent:30});
    expect(post).toHaveBeenCalledWith('/courses/c/lessons/i/complete');
  });
  it('does not treat an unsuccessful response as a saved completion', async () => {
    post.mockResolvedValueOnce({data:{success:false,error:{message:'Not enrolled'}}});
    await expect(courseCompletionService.markLessonComplete('c','i')).rejects.toThrow('Not enrolled');
  });
  it('retains a failed completion for explicit retry and acknowledges only success', async () => {
    post.mockRejectedValueOnce(new Error('Offline'));
    const saved=jest.fn(), sync=new LessonProgressSync('c',saved);
    await expect(sync.complete('i')).rejects.toThrow('Offline');
    expect(saved).not.toHaveBeenCalled();
    await sync.flush();
    expect(post).toHaveBeenCalledTimes(2);
    expect(saved).toHaveBeenCalledWith({itemId:'i',kind:'complete'});
  });
  it('serializes playback and completion, coalescing newer samples without losing them', async () => {
    let resolve!: () => void;
    put.mockImplementationOnce(()=>new Promise<void>((done)=>{resolve=done;}).then(()=>({data:{success:true}})));
    const saved=jest.fn(), sync=new LessonProgressSync('c',saved);
    const first=sync.progress('i',10,10);
    await Promise.resolve();
    void sync.progress('i',20,20);
    void sync.progress('i',30,30);
    void sync.complete('i');
    expect(post).not.toHaveBeenCalled();
    resolve(); await first;
    expect(put.mock.calls.map((call)=>call[1].positionSeconds)).toEqual([10,30]);
    expect(saved.mock.calls.map((call)=>call[0].kind)).toEqual(['progress','progress','complete']);
  });
  it('includes an exit sample queued immediately after an empty parent flush', async () => {
    const sync=new LessonProgressSync('c',jest.fn());
    const flushing=sync.flush();
    void sync.progress('i',42,35);
    await flushing;
    expect(put).toHaveBeenCalledWith('/courses/c/lessons/i/progress',{positionSeconds:42,progressPercent:35});
  });
  it('sends native file uploads with the exact lesson association', async () => {
    post.mockResolvedValueOnce({data:{success:true,data:{id:'submission'}}});
    const append=jest.spyOn(FormData.prototype,'append');
    await submissionsService.create({title:'Work',description:'Notes',courseId:'c',weekId:'w',itemId:'i',file:{uri:'file:///work.txt',name:'work.txt',type:'text/plain'}});
    expect(append).toHaveBeenCalledWith('courseId','c');
    expect(append).toHaveBeenCalledWith('weekId','w');
    expect(append).toHaveBeenCalledWith('itemId','i');
    expect(append).toHaveBeenCalledWith('file',expect.objectContaining({uri:'file:///work.txt',name:'work.txt',type:'text/plain'}));
    append.mockRestore();
  });
});
