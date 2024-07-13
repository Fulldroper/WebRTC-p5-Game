// create a users collection
let users = []

const online = {
  _id: false,
  isHost: true,

  set id(value) {
    if (document.router.hostID.length < 1) {
      document.router.hostID = value;
    }
    this._id = value;
    users[0].id = value;
  },
  get id() {
    return this._id;
  }
}

// Create a new document prototype for routing
// src: https://github.com/Fulldroper/route-roller
Document.prototype.router = {
  host: window.location.origin,

  history: window.history,
  location: window.location,

  get path() {
    return window.history.pathname
  },

  set path(value) {
    this.history.replaceState(null, '',
      this.host + value
    );
  },

  set hostID(id) {
    if(history.pushState) {
      history.pushState(null, null, `#${id}`);
    } else {
        location.hash = `#${id}`;
    }
  },

  get hostID() {
    return window.location.hash.slice(1)
  },

  get shareURL() {
    return `${window.location.protocol}//${window.location.host}${window.location.pathname}#${window.location.hash}`
  }
}

// Create peer connection
const peer = new Peer(
//   { 
//   config: {'iceServers': [{ 'urls': 'stun:stun.l.google.com:19302' }] },
//   timeout: 120000
// }
);

// handle if has server connection
peer.on("open", (id) => {
  online.id = id;
  document.router.hostID == online.id ? host() : client();
})

const ipc = {
 "init" : function ({
    x, y, id, size, color
  }) {
    // add user
    users.push(new User({ x, y, id, size, color }))
  },
  "position" : function({ x, y, id }) {
    // update position of user
    let u = users.find(user => user.id == id)
      u.x = x
      u.y = y
  },
  "positions" : function(array) {
    array.forEach(user => {
      const { x, y, id } = user;
      let u = users.find(user => user.id == id)
      if (u) {
        u.x = x
        u.y = y
      } else {
        // add user
        users.push(new User(user))
      }
    })
      // if (users.length !== (array.length + 1)) {
      //   const arraySet = new Set(array.map(user => user.id));
      //   users = users.filter(user => {

      //     console.log(
      //       arraySet.has(user.id), user.id
      //       ,user.id == online.id, online.id
      //     );

      //     return (arraySet.has(user.id) && user.id == online.id)
      //   })
      // }
  }
}

// client logic
function client() {
  online.isHost = false;
  const conn = peer.connect(document.router.hostID)
  conn.on('open', () => {
    conn.send(JSON.stringify({
      "event": "init",
      "value": users[0].export()
    }))

    const interval = setInterval(() => conn.send(JSON.stringify({
      "event": "position",
      "value": {
        x: camera.x,
        y: camera.y,
        id: online.id,
      }
    })), 100);

    conn.on('data', function(data) {
      const d = JSON.parse(data)
      ipc[d.event](d.value)
    });

    conn.on('close', function() {
      clearInterval(interval)
      users = [users[0]];
      online.id = false;
    })

    conn.on('error', function(e) {
      clearInterval(interval)
      users = [users[0]];
      online.id = false;
      console.error(e);
    })
  })
}
// host logic
function host() {
  peer.on("connection", (conn) => {
    conn.on('open', () => {
      const pid = conn.peer

      conn.send(JSON.stringify({
        "event": "init",
        "value": users[0].export()
      }))

      const interval = setInterval(() => conn.send(JSON.stringify({
        "event": "positions",
        "value": users.filter(user => user.id !== pid).map(({x, y, id, color, size}) => id == online._id ? ({x: camera.X, y: camera.Y, id, color, size}) : ({x, y, id, color, size}))
      })), 100);

      conn.on('data', function(data) {
        const d = JSON.parse(data)
        ipc[d.event](d.value)
      });
      
      conn.on('close', function() {
        clearInterval(interval)
        users = users.filter(user => user.id !== pid);
      })
  
      conn.on('error', function(e) {
        clearInterval(interval)
        users = users.filter(user => user.id !== pid);
        console.error(pid, e);
      })
    })
  })
}

// camera and positions scheme
const camera = {
  x: 0, 
  y: 0,
  
  get vw() {
    return window.innerWidth
  },
  get vh() {
    return window.innerHeight
  },

  get anchor() {
    return {
      x: this.vw / 2,
      y: this.vh / 2
    }
  },

  get position() {
    const { x, y } = this.anchor

    return {
      x: x - this.x,
      y: y - this.y
    }
  },

  set X(value) {
    this.x = value
  },
  set Y(value) {
    this.y = value
  },

  get X() {
    return this.x
  },
  get Y() {
    return this.y
  },

  isOutFieldOfView({x, y}) {
    return (x > 0 || x < this.vw) && (y > 0 || y < this.vh);
  }
}

class inputController {
  constructor(options = {}) {
    const {
      left  = "ArrowLeft",
      right = "ArrowRight",
      up    = "ArrowUp",
      down  = "ArrowDown",
    } = options

    this.keys = {
      left,
      right,
      up,
      down, 
    }

    this.state = []
  }

  changeKey(key, new_key) {
    this.keys[key] = new_key
  }

  released(key) {
    this.state = this.state.filter(x => x !== key)
  }

  pressed(key) {
    this.state.includes(key) || this.state.push(key)
  }

  flush() {
    this.state = []
  }

  async process(fn) {
    for (const key of this.state) {
      fn(key)
    }
  }
}
class User {
  constructor(options = {}) {
    const {
      x, y, id = false, size = 1, color = [rand(255), rand(150, 10), 255]
    } = options;

    this.x = x;
    this.y = y;
    this.id = id;    
    this.color = color;
    this.size = size;
  }

  render(isSelf = false) {
    colorMode(HSB);
    fill(...this.color);
    textSize(this.size * 1.5);
    const {x, y} = camera.anchor

    if (isSelf) {
      text(this.id, x - (textWidth(this.id) / 2), y - 15);
      ellipse(x, y, this.size, this.size);
    } else {
      text(this.id, this.x - (-x) - camera.X - (textWidth(this.id) / 2), this.y - (-y) - camera.Y - 15);
      ellipse(this.x - (-x) - camera.X, this.y - (-y) - camera.Y, this.size, this.size);
    }
    fill(255, 255, 255);
  }

  export() {
    return {
      x: camera.x,
      y: camera.y,
      id: online.id,
      size: this.size,
      color: this.color
    }
  }
}
// initialize input controller
const controller = new inputController();
function rand(max, min = 0) {
  return Math.random() * (max - min) + min;
}
function randMove(steps = 10) {
  let pos = 0
  let i = 0
  let cache = 1

  return function() {
    if (i > steps) {
      i = 0
      const move = [0, 1, -1]
      cache = move[Math.floor(Math.random() * 3)]
      return pos += cache
    } else {
      i++
      if (cache < 1) {
        return pos--
      } else if (cache > 1) {
        return pos++
      } else return pos
    }
  }
}
// draw grid
const drawGrid = (gridSize = 10) => {
  
}
function setup() {
  // create flexible canvas
  createCanvas(camera.vw, camera.vh);
  // create user
  users.push(new User({
    x: 0, y: 0,
    size: 10,
  }))
}
// window resize fix
window.onresize = _ => resizeCanvas(camera.vw, camera.vh)
window.onkeydown = ({code}) => controller.pressed(code)
window.onkeyup = ({code}) => controller.released(code)
window.onblur = () => controller.flush()

function draw() {
  clear()
  background("#363c49");
  drawGrid()
  // render players
  users.forEach((user, i) => {
    // if user isn`t me
    // camera.isOutFieldOfView({x, y}) &&
    user.render(user.id == online.id)
  })
  // draw ui
  fill(255)
  textSize(14);
  text(`Staus: ${online?.id ? "Online" : "Offline"}`, 10, 20);
  text(`x: ${camera.X}, y: ${camera.Y}, fps: ${getTargetFrameRate()}`, 10, 40);
  text(`Users: ${users.length}`, 10, 60);

  controller.process((x => {
    switch (x) {
      case "ArrowRight": camera.X++;break;
      case "ArrowLeft": camera.X--;break;
      case "ArrowUp": camera.Y--;break;
      case "ArrowDown": camera.Y++;break;
    }
  }).bind(this));
}