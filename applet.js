const Applet = imports.ui.applet;
const GLib = imports.gi.GLib;
const Lang = imports.lang;
const PopupMenu = imports.ui.popupMenu;
const St = imports.gi.St;
const Mainloop = imports.mainloop;

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

    // Restart
    let restart = new PopupMenu.PopupIconMenuItem(
      _("Restart"),
      "reload",
      St.IconType.SYMBOLIC
    );
    restart.connect(
      "activate",
      Lang.bind(this, () => {
        this._run("restart").then(() => Lang.bind(this, this._checkStatus)).catch(global.logError);
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
        this._run("stop").then(() => Lang.bind(this, this._checkStatus)).catch(global.logError);
        return true;
      })
    )
    this.menu.addMenuItem(stop);

    Mainloop.timeout_add_seconds(15, Lang.bind(this, this._checkStatus));
  }

  _run(cmd) {
    let [success, argv] = GLib.shell_parse_argv("pkexec nextdns " + cmd);
    let flags = GLib.SpawnFlags.SEARCH_PATH | GLib.SpawnFlags.DO_NOT_REAP_CHILD;
    super.set_applet_tooltip("NextDNS is doing something...");
    super.set_applet_icon_name("content-loading-symbolic");
    try {
      let [result, pid] = GLib.spawn_async(null, argv, null, flags, null);
      return new Promise((resolve, reject) => {
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
