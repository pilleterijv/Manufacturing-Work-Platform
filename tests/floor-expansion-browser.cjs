require("tsx/cjs");require("dotenv").config({quiet:true});
const assert=require("node:assert/strict"),{randomUUID}=require("node:crypto"),fs=require("node:fs/promises"),sharp=require("sharp"),{chromium}=require("playwright");
const {db}=require("../lib/db.ts"),{hashPassword}=require("../lib/security.ts"),{fiveSPillars}=require("../lib/floor-rules.ts"),{localToday}=require("../lib/operations-rules.ts"),{sendRecovery}=require("../lib/account-recovery.ts"),{submitMaintainx}=require("../lib/maintainx.ts");
const origin=process.env.APP_URL||"http://localhost:3000",prefix="Floor11-"+randomUUID().slice(0,8),users=[],equipment=[],areas=[],contexts=[];
let browser,mappingBefore,createdRegistrationUser;
const post=(c,path,data)=>c.request.post(origin+path,{headers:{Origin:origin},data});
const get=(c,path)=>c.request.get(origin+path);
async function read(r,status=200){const text=await r.text();assert.equal(r.status(),status,text);return JSON.parse(text)}
async function main(){
 assert(!process.env.SMTP_HOST,"Use a local test environment without external SMTP");
 assert(["localhost","127.0.0.1"].includes(new URL(origin).hostname));assert(["localhost","127.0.0.1"].includes(new URL(process.env.DATABASE_URL).hostname));
 mappingBefore=await db.setting.findUnique({where:{key:"maintainx-assets"}});
 const password="Pilot "+randomUUID()+"!",hash=await hashPassword(password),zone=(await db.setting.findUniqueOrThrow({where:{key:"shifts"}})).value.timezone,today=localToday(zone);
 for(const [role,department,name] of [["Admin","A","Admin"],["Manager","A","Manager Alpha"],["DL/TL","A","Leader Alpha"],["Operator","A","Operator Alpha"],["Operator","B","Operator Beta"]])users.push(await db.user.create({data:{username:prefix.toLowerCase()+"-"+users.length,name:prefix+" "+name,email:prefix.toLowerCase()+"-"+users.length+"@example.invalid",role,password:hash,mustChange:false,workspaceAccess:{mode:"restricted",locations:[{plant:prefix,department,area:"Packing"}],equipmentIds:[]}}}));
 for(const department of ["A","B"]){areas.push(await db.location.create({data:{plant:prefix,department,area:"Packing",line:"1"}}));equipment.push(await db.equipment.create({data:{name:prefix+" Machine "+department,plant:prefix,department,area:"Packing",line:"1"}}))}
 browser=await chromium.launch({executablePath:"/usr/bin/chromium",headless:true,args:["--no-sandbox"]});
 async function login(u){const c=await browser.newContext({viewport:{width:1440,height:1100},timezoneId:"America/Chicago",serviceWorkers:"block"});contexts.push(c);await read(await post(c,"/api/account",{action:"login",username:u.username,password,remember:false}));return c}
 const [admin,manager,leader,operator,beta]=await Promise.all(users.map(login)),anon=await browser.newContext({serviceWorkers:"block"});contexts.push(anon);
 await read(await get(anon,"/api/five-s"),401);
 const questions=fiveSPillars.map(pillar=>({id:randomUUID(),pillar,text:prefix+" "+pillar,photo:false})),planBody={action:"save",title:prefix+" Area 5S",locationId:areas[0].id,questions,assigneeIds:[users[2].id],active:true};
 await read(await post(operator,"/api/five-s",planBody),403);
 await read(await post(manager,"/api/five-s",{...planBody,locationId:areas[1].id}),403);
 await read(await post(manager,"/api/five-s",{...planBody,questions:questions.map(q=>({...q,pillar:"Sort"}))}),400);
 await read(await post(manager,"/api/five-s",planBody));
 let five=await read(await get(leader,"/api/five-s")),plan=five.plans.find(p=>p.title===planBody.title);assert(plan);
 assert(!(await read(await get(beta,"/api/five-s"))).plans.some(p=>p.id===plan.id));
 const responses=questions.map(q=>({questionId:q.id,score:4,comment:"Test observation",media:[]}));
 await read(await post(operator,"/api/five-s",{action:"complete",id:plan.id,version:plan.version,responses}),403);
 await read(await post(leader,"/api/five-s",{action:"complete",id:plan.id,version:plan.version,responses:responses.slice(1)}),400);
 const photo=(await read(await post(leader,"/api/photos",{image:"data:image/png;base64,"+(await sharp({create:{width:32,height:32,channels:3,background:"#49a99d"}}).png().toBuffer()).toString("base64")}))).id;
 plan=await db.fiveSPlan.update({where:{id:plan.id},data:{questions:[{...questions[0],photo:true},...questions.slice(1)]}});
 await read(await post(leader,"/api/five-s",{action:"complete",id:plan.id,version:plan.version,responses}),400);
 responses[0].media=[{id:photo,kind:"photo",caption:"Test area"}];
 const auditId=(await read(await post(leader,"/api/five-s",{action:"complete",id:plan.id,version:plan.version,responses}))).id;
 const audit=await db.fiveSAudit.findUniqueOrThrow({where:{id:auditId}});assert.equal(audit.score,20);assert.equal(audit.maximum,25);
 assert.equal((await get(manager,"/api/photos/"+photo)).status(),200);assert.equal((await get(beta,"/api/photos/"+photo)).status(),403);
 await read(await post(manager,"/api/platform",{action:"standard",kind:"audit",assigneeIds:[users[2].id],title:prefix+" DL 5S",equipmentId:equipment[0].id,target:60,tolerance:10,steps:[{id:"5s",text:"Verify area 5S",photo:false,fiveSPlanId:plan.id}]}));
 const standard=await db.standard.findFirstOrThrow({where:{title:prefix+" DL 5S"}}),run={action:"audit",standardId:standard.id,started:new Date().toISOString(),operator:"",responses:[{stepId:"5s",answer:true,photo:null,comment:"Verified"}]};
 await read(await post(leader,"/api/platform",run),400);
 await read(await post(leader,"/api/platform",{...run,responses:[{...run.responses[0],fiveSAuditId:auditId}]}));
 const savedAudit=await db.fiveSAudit.findUniqueOrThrow({where:{id:auditId}});await read(await post(manager,"/api/five-s",{...planBody,id:plan.id,version:plan.version,title:planBody.title+" revised"}));assert.deepEqual((await db.fiveSAudit.findUniqueOrThrow({where:{id:auditId}})).snapshot,savedAudit.snapshot);
 const cil={action:"save",kind:"cil",title:prefix+" Daily CIL",equipmentId:equipment[0].id,assigneeId:users[3].id,intervalDays:1,nextDue:today,active:true,steps:[{id:"clean",text:"Clean and inspect guards",photo:false}]};
 await read(await post(manager,"/api/maintenance",cil));const cilPlan=(await read(await get(operator,"/api/maintenance?kind=cil"))).plans.find(p=>p.title===cil.title);assert(cilPlan);assert(!(await read(await get(operator,"/api/maintenance"))).plans.some(p=>p.id===cilPlan.id));
 await read(await post(operator,"/api/maintenance",{action:"complete",id:cilPlan.id,version:cilPlan.version,responses:[{stepId:"clean",answer:false,comment:"Abnormality reported separately",media:[]}]}));
 assert((await read(await get(operator,"/api/maintenance?kind=cil"))).records.some(r=>r.data.planId===cilPlan.id));assert(!(await read(await get(operator,"/api/maintenance"))).records.some(r=>r.data.planId===cilPlan.id));
 const defectBody={action:"report",equipmentId:equipment[0].id,title:prefix+" Loose guard",description:"Guard mount loose at inspection",priority:"High",media:[]};
 await read(await post(beta,"/api/defects",defectBody),403);const defectId=(await read(await post(operator,"/api/defects",defectBody))).id;
 await read(await post(beta,"/api/defects",{action:"update",id:defectId,version:1,status:"Resolved",assigneeId:null,comment:""}),403);
 await read(await post(manager,"/api/defects",{action:"update",id:defectId,version:1,status:"Open",assigneeId:users[2].id,comment:"Assigned for inspection"}));
 await read(await post(manager,"/api/defects",{action:"update",id:defectId,version:1,status:"Resolved",assigneeId:users[2].id,comment:""}),409);
 await read(await post(operator,"/api/defects",{action:"mapping",assets:{[equipment[0].id]:101}}),403);
 await read(await post(admin,"/api/defects",{action:"mapping",assets:{...(mappingBefore?.value??{}),[equipment[0].id]:101}}));
 // Injectable transport: no request reaches MaintainX, and no real key is used.
 const previousKey=process.env.MAINTAINX_API_KEY;process.env.MAINTAINX_API_KEY="synthetic-test-key";
 let sends=0;try{
 const stub=async(url,options)=>{sends++;assert.equal(url,"https://api.getmaintainx.com/v1/workorders");assert.equal(JSON.parse(options.body).externalData.floorworkDefectId,defectId);return new Response(JSON.stringify({workOrder:{id:1234}}),{status:200})};
 const results=await Promise.allSettled([submitMaintainx(defectId,stub),submitMaintainx(defectId,stub)]);assert.equal(results.filter(r=>r.status==="fulfilled").length,1);assert.equal(sends,1);
 const uncertain=(await read(await post(operator,"/api/defects",{...defectBody,title:prefix+" uncertain"}))).id;
 await assert.rejects(()=>submitMaintainx(uncertain,async()=>{throw Error("timeout")}));assert.equal((await db.defect.findUniqueOrThrow({where:{id:uncertain}})).maintainxStatus,"Review required");
 await assert.rejects(()=>submitMaintainx(uncertain,stub));assert.equal(sends,1);
 await read(await post(admin,"/api/defects",{action:"reconcile",id:uncertain,workOrderId:null,confirmedAbsent:false}),400);
 await read(await post(admin,"/api/defects",{action:"reconcile",id:uncertain,workOrderId:"4321"}));
 }finally{if(previousKey===undefined)delete process.env.MAINTAINX_API_KEY;else process.env.MAINTAINX_API_KEY=previousKey}
 const idea=await db.idea.create({data:{title:prefix+" assigned idea",equipmentId:equipment[0].id,equipmentSnapshot:equipment[0],currentState:"Before",proposal:"After",dueDate:today,createdBy:users[1].id,submitterId:users[1].id,pilotId:users[2].id,validatorId:users[3].id}});
 const otherIdea=await db.idea.create({data:{title:prefix+" unrelated idea",equipmentId:equipment[0].id,equipmentSnapshot:equipment[0],currentState:"Before",proposal:"After",dueDate:today,createdBy:users[1].id,submitterId:users[1].id,pilotId:users[1].id,validatorId:users[1].id}});
 const problem=await db.problem.create({data:{reference:prefix,title:prefix+" investigation",method:"4D",equipmentId:equipment[0].id,equipmentSnapshot:equipment[0],occurredOn:today,reportedBy:users[1].name,ownerId:users[2].id,reviewerId:users[1].id,team:"",dueDate:today,answers:{},createdBy:users[1].id,history:[]}});
 await db.problemAction.create({data:{problemId:problem.id,type:"Corrective",title:"Investigate cause",ownerId:users[3].id,dueDate:today,history:[]}});
 const dash=await read(await get(operator,"/api/personal-dashboard"));assert(dash.ideas.some(i=>i.id===idea.id));assert(!dash.ideas.some(i=>i.id===otherIdea.id));assert(dash.problems.some(p=>p.id===problem.id));assert(dash.defects.some(d=>d.id===defectId));assert(!(await read(await get(beta,"/api/personal-dashboard"))).ideas.some(i=>i.id===idea.id));
 await read(await post(manager,"/api/personal-dashboard",{department:{plant:prefix,department:"B"}}),403);await read(await post(admin,"/api/personal-dashboard",{userId:users[1].id,department:{plant:prefix,department:"A"}}));
 const dept=await read(await get(manager,"/api/personal-dashboard?scope=department"));assert(dept.ideas.some(i=>i.id===otherIdea.id));assert(!dept.equipment.some(e=>e.id===equipment[1].id));
 assert((await read(await get(manager,"/api/people?search=Leader%20Alpha"))).people.some(p=>p.id===users[2].id));assert(!(await read(await get(manager,"/api/people?search=Operator%20Beta"))).people.length);
 const requestName=prefix.toLowerCase()+"-new";
 await read(await post(anon,"/api/access-requests",{action:"register",username:requestName,name:prefix+" Applicant",email:requestName+"@example.invalid",department:"A",reason:"Pilot access"}));
 const request=await db.registrationRequest.findFirstOrThrow({where:{username:requestName}});await read(await get(operator,"/api/access-requests"),403);
 const approval=await read(await post(admin,"/api/access-requests",{id:request.id,decision:"Approved"}));createdRegistrationUser=approval.userId;const newUser=await db.user.findUniqueOrThrow({where:{id:approval.userId}});assert.deepEqual(newUser.workspaceAccess,{mode:"restricted",locations:[],equipmentIds:[]});assert.equal(newUser.role,"Operator");
 await read(await post(admin,"/api/access-requests",{id:request.id,decision:"Approved"}),409);
 const generic=(await read(await post(anon,"/api/access-requests",{action:"forgot",identity:prefix+"-missing"}))).message;
 assert.equal((await read(await post(anon,"/api/access-requests",{action:"forgot",identity:requestName}))).message,generic);
 // Capture reset mail locally, assert single-use and disabled-account invalidation.
 const envBefore={SMTP_HOST:process.env.SMTP_HOST,SMTP_FROM:process.env.SMTP_FROM};process.env.SMTP_HOST="synthetic.invalid";process.env.SMTP_FROM="floorwork@example.invalid";let mail;
 try{
 assert(await sendRecovery(newUser.id,{sendMail:async v=>{mail=v},close:()=>{}}));assert.equal(mail.to,newUser.email);const token=mail.text.match(/#reset=([a-f0-9]{64})/)[1];assert(!JSON.stringify(await db.passwordReset.findMany({where:{userId:newUser.id}})).includes(token));
 const newPassword="New "+randomUUID()+"!";await read(await post(anon,"/api/access-requests",{action:"reset",token,password:newPassword}));await read(await post(anon,"/api/access-requests",{action:"reset",token,password:newPassword}),400);
 await read(await post(anon,"/api/account",{action:"login",username:newUser.username,password:newPassword,remember:false}));
 assert(await sendRecovery(newUser.id,{sendMail:async v=>{mail=v},close:()=>{}}));const disabledToken=mail.text.match(/#reset=([a-f0-9]{64})/)[1];
 await read(await post(admin,"/api/platform",{action:"user",id:newUser.id,username:newUser.username,name:newUser.name,email:newUser.email,role:"Operator",active:false}));
 assert.equal((await read(await get(anon,"/api/account"))).user,null);await read(await post(anon,"/api/access-requests",{action:"reset",token:disabledToken,password:newPassword}),400);
 }finally{for(const [k,v]of Object.entries(envBefore)){if(v===undefined)delete process.env[k];else process.env[k]=v}}
 // Actual desktop/tablet UI, directory search and screenshots.
 const shots="docs/screenshots/five-s-tpm";await fs.mkdir(shots,{recursive:true});
 const page=await manager.newPage();await page.goto(origin);await page.getByRole("heading",{name:"My assignments",exact:true}).waitFor();assert(await page.getByText(otherIdea.title,{exact:true}).count());await page.screenshot({path:shots+"/personal-dashboard.png",fullPage:true});
 await page.getByRole("button",{name:"Department dashboard",exact:true}).click();await page.getByRole("heading",{name:"My department at a glance",exact:true}).waitFor();await page.screenshot({path:shots+"/department-dashboard.png",fullPage:true});
 await page.locator("nav").getByRole("button",{name:"5S audits",exact:true}).click();await page.getByRole("heading",{name:"5S area audits",exact:true}).waitFor();await page.getByText(planBody.title+" revised",{exact:true}).waitFor();await page.screenshot({path:shots+"/five-s-audits.png",fullPage:true});
 await page.locator("nav").getByRole("button",{name:"TPM / CIL",exact:true}).click();await page.getByRole("heading",{name:"TPM · Clean, Inspect and Lubricate",exact:true}).waitFor();await page.getByText(cil.title,{exact:true}).first().waitFor();await page.screenshot({path:shots+"/cil-checks.png",fullPage:true});
 await page.locator("nav").getByRole("button",{name:"Defect reporting",exact:true}).click();await page.getByRole("heading",{name:"Defect register",exact:true}).waitFor();await page.getByText("MaintainX: Submitted · Work order 1234",{exact:true}).waitFor();await page.screenshot({path:shots+"/defect-register.png",fullPage:true});
 await page.locator("nav").getByRole("button",{name:"Improvement ideas",exact:true}).click();const pilot=page.getByLabel("Pilot / person responsible",{exact:true}); // use the rendered directory search below, field label may differ across legacy skins
 const searches=page.getByRole("textbox",{name:"Search employee directory",exact:true});await searches.first().waitFor();await searches.first().fill("Leader Alpha");assert(await searches.first().locator("..").locator("select option").filter({hasText:"Leader Alpha"}).count());assert.equal(await searches.first().locator("..").locator("select option").filter({hasText:"Operator Alpha"}).count(),0);
 const publicPage=await (await browser.newContext({viewport:{width:768,height:1024},serviceWorkers:"block"})).newPage();contexts.push(publicPage.context());await publicPage.goto(origin);await publicPage.getByRole("button",{name:"Request an account",exact:true}).click();await publicPage.getByRole("heading",{name:"Request company access",exact:true}).waitFor();await publicPage.screenshot({path:shots+"/registration-request.png",fullPage:true});
 console.log("PASS: area-scoped 5S, required media and immutable history, DL/TL 5S gate, separate CIL recurrence/history, defects and scoped assignments, MaintainX duplicate/uncertain handling with fake transport, personal/department dashboards, searchable accounts, registration approval, single-use reset emails and disabled-account protection; desktop/tablet UI.");
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(async()=>{
 for(const c of contexts)await c.close().catch(()=>{});await browser?.close();
 const ids=[...users.map(u=>u.id),...(createdRegistrationUser?[createdRegistrationUser]:[])],eqids=equipment.map(e=>e.id);
 await db.notification.deleteMany({where:{OR:[{userId:{in:ids}},{kind:"registration",message:{contains:prefix}}]}});
 await db.reminder.deleteMany({where:{equipmentId:{in:eqids}}});await db.record.deleteMany({where:{userId:{in:ids}}});await db.fiveSAudit.deleteMany({where:{locationId:{in:areas.map(a=>a.id)}}});await db.fiveSPlan.deleteMany({where:{createdBy:{in:ids}}});await db.defect.deleteMany({where:{equipmentId:{in:eqids}}});await db.maintenancePlan.deleteMany({where:{equipmentId:{in:eqids}}});await db.standard.deleteMany({where:{equipmentId:{in:eqids}}});await db.problemAction.deleteMany({where:{problem:{equipmentId:{in:eqids}}}});await db.problem.deleteMany({where:{equipmentId:{in:eqids}}});await db.ideaParticipant.deleteMany({where:{idea:{equipmentId:{in:eqids}}}});await db.idea.deleteMany({where:{equipmentId:{in:eqids}}});
 for(const p of await db.photo.findMany({where:{userId:{in:ids}}}))await fs.rm("uploads/"+p.id+".webp",{force:true});await db.photo.deleteMany({where:{userId:{in:ids}}});await db.passwordReset.deleteMany({where:{userId:{in:ids}}});await db.registrationRequest.deleteMany({where:{username:{startsWith:prefix.toLowerCase()}}});await db.session.deleteMany({where:{userId:{in:ids}}});await db.user.deleteMany({where:{id:{in:ids}}});await db.equipment.deleteMany({where:{id:{in:eqids}}});await db.location.deleteMany({where:{id:{in:areas.map(a=>a.id)}}});
 if(mappingBefore)await db.setting.upsert({where:{key:mappingBefore.key},create:mappingBefore,update:{value:mappingBefore.value}});else await db.setting.deleteMany({where:{key:"maintainx-assets"}});await db.$disconnect();
});
