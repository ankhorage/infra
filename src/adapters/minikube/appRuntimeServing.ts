import type { GeneratedInfrastructureFile } from '../../types';

const APP_IMAGE_DOCKERFILE_PATH = 'infra/minikube/app-image/Dockerfile';
const NGINX_LISTEN_DIRECTIVE = '  listen 8080;';
const NGINX_RELATIVE_REDIRECT_DIRECTIVE = '  absolute_redirect off;';

export function preserveForwardedAppOrigin(
  files: readonly GeneratedInfrastructureFile[],
): GeneratedInfrastructureFile[] {
  const appImageDockerfileIndex = files.findIndex(
    (file) => file.path === APP_IMAGE_DOCKERFILE_PATH,
  );

  if (appImageDockerfileIndex < 0) {
    throw new Error(
      `Missing generated app image Dockerfile: ${APP_IMAGE_DOCKERFILE_PATH}`,
    );
  }

  return files.map((file, index) =>
    index === appImageDockerfileIndex
      ? {
          ...file,
          content: addRelativeRedirectPolicy(file.content),
        }
      : file,
  );
}

function addRelativeRedirectPolicy(dockerfile: string): string {
  if (dockerfile.includes(NGINX_RELATIVE_REDIRECT_DIRECTIVE)) return dockerfile;

  const listenDirective = `${NGINX_LISTEN_DIRECTIVE}\n`;
  if (!dockerfile.includes(listenDirective)) {
    throw new Error(
      'Generated app nginx config is missing its expected listen directive.',
    );
  }

  return dockerfile.replace(
    listenDirective,
    `${listenDirective}${NGINX_RELATIVE_REDIRECT_DIRECTIVE}\n`,
  );
}
