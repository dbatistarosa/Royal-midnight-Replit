if(!process.env.npm_config_user_agent?.startsWith('pnpm/')){
 console.error('Use pnpm to preserve the workspace lockfile.');process.exit(1);
}
