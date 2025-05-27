const Applet = imports.ui.applet;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Mainloop = imports.mainloop;
const Gio = imports.gi.Gio;

class CinnamonUserApplet extends Applet.TextIconApplet {
  constructor(orientation, panel_height, instance_id) {
    super(orientation, panel_height, instance_id);

    this.setAllowedLayout(Applet.AllowedLayout.BOTH);

    this.set_applet_icon_name("nextdns");
    this.set_applet_label("");

    // Create the popup menu
    this.menuManager = new PopupMenu.PopupMenuManager(this);
    this.menu = new Applet.AppletPopupMenu(this, orientation);
    this.menuManager.addMenu(this.menu);
    this._contentSection = new PopupMenu.PopupMenuSection();
    this.menu.addMenuItem(this._contentSection);

    this.isCmding = false;
    this.LOOP_PERIOD = 10;
    this.LOG_LINES_TO_CHECK = 3;

    // Restart
    let restart = new PopupMenu.PopupIconMenuItem(
      _("Restart"),
      "reload",
      St.IconType.SYMBOLIC
    );
    restart.connect(
      "activate",
      Lang.bind(this, () => {
        this._run("restart")
          .then(() => Lang.bind(this, this._checkStatus))
          .catch(global.logError);
        return true;
      })
    );
    this.menu.addMenuItem(restart);

    // Stop
    let stop = new PopupMenu.PopupIconMenuItem(
      _("Stop"),
      "stop",
      St.IconType.SYMBOLIC
    );
    stop.connect(
      "activate",
      Lang.bind(this, () => {
        this._run("stop")
          .then(() => Lang.bind(this, this._checkStatus))
          .catch(global.logError);
        return true;
      })
    );
    this.menu.addMenuItem(stop);

    Mainloop.timeout_add_seconds(this.LOOP_PERIOD, Lang.bind(this, this._loop));
  }

  _loop() {
    this._checkStatus();
    try {
      if (this.isCmding) {
        return true;
      }

      let [success, argv] = GLib.shell_parse_argv("nextdns log");
      let flags =
        GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD;
      let [result, pid, stdin, stdoutFd, stderrFd] =
        GLib.spawn_async_with_pipes(null, argv, null, flags, null);

      if (!result) {
        global.logError("Failed to spawn nextdns log");
        return true;
      }

      let stdoutStream = new Gio.DataInputStream({
        base_stream: new Gio.UnixInputStream({ fd: stdoutFd, close_fd: true }),
      });

      // Read all lines asynchronously
      let lines = [];
      let readLineAsync = (callback) => {
        stdoutStream.read_line_async(
          GLib.PRIORITY_DEFAULT,
          null,
          (stream, res) => {
            try {
              let [line, length] = stream.read_line_finish(res);
              if (line && length > 0) {
                lines.push(imports.byteArray.toString(line));
                readLineAsync(callback);
              } else {
                callback();
              }
            } catch (e) {
              global.logError("Error reading nextdns log output: " + e.message);
              callback();
            }
          }
        );
      };

      readLineAsync(() => {
        if (lines.length > 0) {
          for (let i = 1; i < this.LOG_LINES_TO_CHECK + 1; ++i) {
            let log = lines[lines.length - i];
            if (log.includes("context deadline exceeded")) {
              let now = new Date();
              let timestamp = log.substring(0, 15);
              let logDate = new Date(`${now.getFullYear()} ${timestamp}`);
              let diffSeconds = (now - logDate) / 1000;
              if (diffSeconds >= 0 && diffSeconds <= this.LOOP_PERIOD) {
                this._run("restart")
                  .then(() => this._checkStatus())
                  .catch(global.logError);
                return true;
              }
            }
          }
        }
      });
    } catch (e) {
      global.logError(e);
      return false;
    }
  }

  _run(cmd) {
    super.isCmding = true;
    let [success, argv] = GLib.shell_parse_argv("pkexec nextdns " + cmd);
    let flags = GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD;
    super.set_applet_tooltip("NextDNS is doing something...");
    super.set_applet_icon_name("content-loading-symbolic");
    try {
      let [result, pid] = GLib.spawn_async(null, argv, null, flags, null);
      return new Promise((resolve, reject) => {
        super.isCmding = false;
        if (result) {
          resolve(pid);
        } else {
          reject("spawn_async failed");
        }
      });
    } catch (e) {
      global.logError("nextdns@cinnamon.org: " + e.message);
    }
  }

  _checkStatus() {
    try {
      let [result, stdout, stderr] =
        GLib.spawn_command_line_sync("nextdns status");
      if (stdout != null) {
        let status = stdout.toString();
        if (status.includes("running")) {
          super.set_applet_tooltip("NextDNS is running");
          super.set_applet_icon_name("nextdns");
        } else if (status.includes("stopped")) {
          super.set_applet_tooltip("NextDNS is stopped");
          super.set_applet_icon_name("nextdns-stopped");
        }
        return true;
      } else {
        return false;
      }
    } catch (e) {
      global.logError(e);
      return false;
    }
  }

  on_applet_clicked() {
    this.menu.toggle();
  }
}

function main(metadata, orientation, panel_height, instance_id) {
  return new CinnamonUserApplet(orientation, panel_height, instance_id);
}
