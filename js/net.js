/* Thin WebSocket client for online play: connects to the room hub and dispatches messages. */

(function () {
  class NetClient {
    constructor(onMessage, onClose) {
      this.socket = null;
      this.pending = null;
      this.onMessage = onMessage;
      this.onClose = onClose;
    }

    get connected() {
      return !!this.socket && this.socket.readyState === WebSocket.OPEN;
    }

    connect() {
      if (this.connected) return Promise.resolve();
      if (this.pending) return this.pending;
      const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
      const socket = new WebSocket(`${protocol}://${window.location.host}`);
      this.socket = socket;

      const current = () => this.socket === socket;
      this.pending = new Promise((resolve, reject) => {
        socket.addEventListener('open', () => {
          if (!current()) {
            socket.close();
            return;
          }
          this.pending = null;
          resolve();
        });
        socket.addEventListener('error', () => {
          if (current()) this.pending = null;
          reject(new Error('Could not reach the game server.'));
        });
        socket.addEventListener('message', (event) => {
          if (!current()) return;
          let message = null;
          try {
            message = JSON.parse(event.data);
          } catch (err) {
            return;
          }
          this.onMessage(message);
        });
        socket.addEventListener('close', () => {
          if (!current()) return;
          this.socket = null;
          this.pending = null;
          this.onClose();
        });
      });
      return this.pending;
    }

    send(message) {
      if (this.connected) this.socket.send(JSON.stringify(message));
    }

    close() {
      if (this.socket) {
        this.send({ type: 'leave' });
        const socket = this.socket;
        this.socket = null;
        this.pending = null;
        socket.close();
      }
    }
  }

  window.Battleship.NetClient = NetClient;
})();
