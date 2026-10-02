import { createApp, listenConfig, attachServer } from './src/app.js';
import { attachPoolPusher } from './src/ws/poolPusher.js';

const server = createApp().listen(listenConfig.port, listenConfig.host);

const poolPusher = attachPoolPusher(server);

attachServer(server, undefined, () => poolPusher.close());

export default server;
