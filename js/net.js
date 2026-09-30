/* Thin WebSocket client for online play: connects to the room hub and dispatches messages. */

(function () {
  class NetClient {
    constructor(onMessage, onClose) {
      this.socket = null;
      this.onMessage = onMessage;
      this.onClose = onClose;
    }

    get connected() {
      return !!this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    connect() {
      if (this.connected) return Promise.resolve();
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${protocol}://${window.location.host}`);
      this.socket = socket;

      return new Promise((resolve, reject) => {
        socket.addEventListener('open', () => resolve());
        socket.addEventListener('error', () => reject(new Error('Could not reach the game server.')));
        socket.addEventListener('message', (event) => {
          let message = null;
          try {
            message = JSON.parse(event.data);
          } catch (err) {
            return;
          }
          this.onMessage(message);
        });
        socket.addEventListener('close', () => {
          this.socket = null;
          this.onClose();
        });
      });
    }

    send(message) {
      if (this.connected) this.socket.send(JSON.stringify(message));
    }

    close() {
      if (this.socket) {
        this.send({ type: 'leave' });
        this.socket.close();
        this.socket = null;
      }
    }
  }

  window.Battleship.NetClient = NetClient;
})();
