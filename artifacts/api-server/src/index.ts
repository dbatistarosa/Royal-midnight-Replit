import app from './app.js';
import { pool } from '@workspace/db';
import { logger } from './lib/logger.js';
const port=Number(process.env.PORT??3001);
if(!Number.isInteger(port)||port<1||port>65535)throw new Error('Invalid PORT');
const server=app.listen(port,()=>logger.info({port},'Server listening'));
server.on('error',err=>{logger.error({err},'Unable to start server');process.exitCode=1;});
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,()=>{
 server.close(()=>{void pool.end().then(()=>process.exit(0));});
 setTimeout(()=>process.exit(1),10000).unref();
});
