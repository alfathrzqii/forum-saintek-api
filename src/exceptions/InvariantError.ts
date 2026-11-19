import { ClientError } from './ClientError.ts';

export class InvariantError extends ClientError {
  constructor(message: string) {
    super(message, 400);
    this.name = 'InvariantError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

export default InvariantError;
