import { BrowserWindow, Menu, MenuItemConstructorOptions } from 'electron';

const isDebug =
  process.env.NODE_ENV === 'development' || process.env.DEBUG_PROD === 'true';

export default class MenuBuilder {
  mainWindow: BrowserWindow;

  constructor(mainWindow: BrowserWindow) {
    this.mainWindow = mainWindow;
  }

  buildMenu(): Menu {
    if (isDebug) this.setupDevelopmentEnvironment();
    const menu = Menu.buildFromTemplate(MenuBuilder.buildTemplate());
    Menu.setApplicationMenu(menu);
    return menu;
  }

  setupDevelopmentEnvironment(): void {
    this.mainWindow.webContents.on('context-menu', (_, props) => {
      const { x, y } = props;

      Menu.buildFromTemplate([
        {
          label: 'Inspect element',
          click: () => {
            this.mainWindow.webContents.inspectElement(x, y);
          },
        },
      ]).popup({ window: this.mainWindow });
    });
  }

  /** Standard menus; roles take their labels and shortcuts from the OS. */
  static buildTemplate(): MenuItemConstructorOptions[] {
    const view: MenuItemConstructorOptions = {
      label: 'View',
      submenu: [
        ...(isDebug
          ? ([
              { role: 'reload' },
              { role: 'toggleDevTools' },
              { type: 'separator' },
            ] as MenuItemConstructorOptions[])
          : []),
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
      ],
    };

    if (process.platform === 'darwin') {
      return [
        { role: 'appMenu' },
        { role: 'editMenu' },
        view,
        { role: 'windowMenu' },
      ];
    }
    return [{ role: 'fileMenu' }, { role: 'editMenu' }, view];
  }
}
