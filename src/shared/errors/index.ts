export class UserAlreadyExistsError extends Error {
  constructor() {
    super('User already exists. Please try with another e-mail.');
  }
}

export class InvalidCredentialsError extends Error {
  constructor() {
    super('Invalid credentials.');
  }
}

export class ResourceNotFoundError extends Error {
  constructor({ resource }: { resource: string }) {
    super(`${resource} not found.`);
  }
}

export class ResourceAlreadyExistsError extends Error {
  constructor({ resource }: { resource: string }) {
    super(`${resource} already exists.`);
  }
}

export class StreamNotFoundError extends Error {
  constructor() {
    super('No streams found for this title.');
  }
}

export class TranscodingFailedError extends Error {
  constructor(reason?: string) {
    super(`Transcoding failed${reason ? `: ${reason}` : '.'}`);
  }
}

export class AddonUnavailableError extends Error {
  constructor(addonUrl: string) {
    super(`Addon unavailable: ${addonUrl}`);
  }
}
