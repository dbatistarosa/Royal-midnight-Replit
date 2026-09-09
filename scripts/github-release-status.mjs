import {spawnSync} from 'node:child_process';
const repo='dbatistarosa/Royal-midnight-Replit';
// Use the existing Git credential helper for its intended GitHub account.
// Credentials remain in memory and are never logged or written to disk.
const credential=spawnSync('git',['credential','fill'],{input:'protocol=https\nhost=github.com\n\n',encoding:'utf8',env:{...process.env,GIT_TERMINAL_PROMPT:'0'}});
if(credential.status!==0)throw new Error('GitHub authentication is unavailable');
const token=credential.stdout.split('\n').find(x=>x.startsWith('password='))?.slice(9);
if(!token)throw new Error('GitHub authentication is unavailable');
const resource=process.argv[2]??'actions/secrets';
if(!/^(actions\/secrets|actions\/runs|commits\/[a-f0-9]+\/check-runs|pulls\/\d+)$/.test(resource))throw new Error('Unsupported read-only resource');
const response=await fetch('https://api.github.com/repos/'+repo+'/'+resource,{headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28'}});
if(!response.ok)throw new Error('GitHub returned HTTP '+response.status);
const result=await response.json();
if(resource==='actions/secrets')console.log(JSON.stringify({secretNames:result.secrets.map(s=>s.name)}));
else if(result.workflow_runs)console.log(JSON.stringify(result.workflow_runs.slice(0,8).map(r=>({id:r.id,name:r.name,status:r.status,conclusion:r.conclusion,sha:r.head_sha,url:r.html_url}))));
else if(result.check_runs)console.log(JSON.stringify(result.check_runs.map(r=>({name:r.name,status:r.status,conclusion:r.conclusion,url:r.details_url}))));
else console.log(JSON.stringify({number:result.number,mergeable:result.mergeable,mergeable_state:result.mergeable_state,head:result.head.sha}));
