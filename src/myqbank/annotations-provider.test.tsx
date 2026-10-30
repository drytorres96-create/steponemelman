import { act, StrictMode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { type Annotation } from './annotations'
const fake=vi.hoisted(()=>({db:new Map<string,unknown>(),read:vi.fn(),rpc:vi.fn()}))
vi.mock('../store/db',()=>({leer:async(key:string)=>fake.db.get(key),escribir:async(key:string,value:unknown)=>{fake.db.set(key,structuredClone(value))}}))
vi.mock('../lib/supabase',()=>({supabase:{from:()=>({select:()=>({eq:(_key:string,user:string)=>({order:()=>({range:()=>fake.read(user)})})})}),rpc:fake.rpc}}))
import { AnnotationProvider, useAnnotations, useHasAnnotationProvider } from './AnnotationProvider'
let host:HTMLDivElement, root:Root, current:ReturnType<typeof useAnnotations>
function Probe(){current=useAnnotations();return <p>{current.status}</p>}
const id='52b549d0-e4b7-48ea-8801-12120a178f0c'
const payload:Annotation={material:'concept',sourceId:'QA',sourceRevision:'r1',variantId:'',editorialVersion:'',kind:'highlight',region:'stem',quote:'alpha',prefix:'',suffix:'',start:0,end:5,changedAt:100,deleted:false}
const mount=async(user='QA-owner')=>{await act(async()=>root.render(<StrictMode><AnnotationProvider key={user} userId={user}><Probe/></AnnotationProvider></StrictMode>))}
beforeEach(()=>{Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});fake.db.clear();localStorage.clear();vi.clearAllMocks();fake.read.mockResolvedValue({data:[],error:null});host=document.createElement('div');document.body.append(host);root=createRoot(host)})
afterEach(async()=>{await act(async()=>root.unmount());host.remove();vi.restoreAllMocks()})
it('detects an annotation provider without requiring one in legacy recovery',async()=>{
  function OptionalProbe(){return <p>{String(useHasAnnotationProvider())}</p>}
  await act(async()=>root.render(<OptionalProbe/>));expect(host.textContent).toBe('false')
  await act(async()=>root.render(<AnnotationProvider userId="QA-owner"><OptionalProbe/></AnnotationProvider>));expect(host.textContent).toBe('true')
})
it('keeps an offline deletion across reload and rejects another account backup',async()=>{
  vi.spyOn(navigator,'onLine','get').mockReturnValue(false)
  await mount()
  await act(async()=>{current.save(id,payload);current.save(id,{...payload,deleted:true,changedAt:200})})
  await act(async()=>root.render(null));await mount()
  expect(current.rows).toHaveLength(1);expect(current.rows[0].payload.deleted).toBe(true)
  expect(current.restore({userId:'other-owner',rows:current.rows})).toContain('must belong')
  expect(current.rows[0].payload.deleted).toBe(true)
})
it('keeps a new deletion made during a CAS response and sends it in the next pass',async()=>{
  const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);await mount()
  await act(async()=>current.save(id,payload))
  let finish!:(value:unknown)=>void
  fake.rpc.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve})).mockImplementation(async(_name,args)=>({data:{ok:true,row:{id,user_id:'QA-owner',payload:args.p_payload,revision:2}},error:null}))
  online.mockReturnValue(true)
  let syncing!:Promise<boolean>, signOutSync!:Promise<boolean>
  await act(async()=>{syncing=current.sync();await Promise.resolve();signOutSync=current.sync()})
  await act(async()=>current.save(id,{...payload,deleted:true,changedAt:200}))
  await act(async()=>{finish({data:{ok:true,row:{id,user_id:'QA-owner',payload,revision:1}},error:null});expect(await syncing).toBe(true);expect(await signOutSync).toBe(true)})
  expect(fake.rpc).toHaveBeenCalledTimes(2)
  expect(current.rows[0]).toMatchObject({payload:{deleted:true},revision:2,dirty:false})
})
it('ignores a stale cloud response after switching accounts',async()=>{
  vi.spyOn(navigator,'onLine','get').mockReturnValue(true)
  let finish!:(value:unknown)=>void
  fake.read.mockImplementation(user=>user==='QA-owner'?new Promise(resolve=>{finish=resolve}):Promise.resolve({data:[],error:null}))
  await mount();await mount('QA-other')
  await act(async()=>finish({data:[{id,user_id:'QA-owner',payload,revision:1}],error:null}))
  expect(current.rows).toEqual([])
  expect(JSON.parse(localStorage.getItem('myqbank-annotations:QA-other')!).rows).toEqual([])
})
it('waits for an in-flight sync before reporting that annotations are safe to sign out',async()=>{
  const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);await mount()
  await act(async()=>current.save(id,payload))
  let finish!:(value:unknown)=>void
  fake.rpc.mockImplementationOnce(()=>new Promise(resolve=>{finish=resolve}))
  online.mockReturnValue(true)
  let first!:Promise<boolean>, second!:Promise<boolean>, finished=false
  await act(async()=>{first=current.sync();await Promise.resolve();second=current.sync();void second.then(()=>{finished=true});await Promise.resolve()})
  expect(finished).toBe(false)
  await act(async()=>{finish({data:{ok:true,row:{id,user_id:'QA-owner',payload,revision:1}},error:null});expect(await first).toBe(true);expect(await second).toBe(true)})
  expect(current.rows[0].dirty).toBe(false)
})
it('reports an unsuccessful sync when annotations remain pending',async()=>{
  const online=vi.spyOn(navigator,'onLine','get').mockReturnValue(false);await mount()
  await act(async()=>current.save(id,payload))
  fake.rpc.mockResolvedValue({data:null,error:new Error('network failure')});online.mockReturnValue(true)
  await act(async()=>expect(await current.sync()).toBe(false))
  expect(current.rows[0].dirty).toBe(true)
})
