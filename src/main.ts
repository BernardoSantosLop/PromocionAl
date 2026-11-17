import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';
import { retirarServiceWorker } from './retirar-service-worker';

retirarServiceWorker()
  .then((recargando) => (recargando ? undefined : bootstrapApplication(App, appConfig)))
  .catch((err) => console.error(err));
