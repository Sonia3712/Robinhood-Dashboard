import { createApp, listenConfig, attachServer } from './src/app.js';

const server = createApp().listen(listenConfig.port, listenConfig.host);

attachServer(server);
//export
export default server;
