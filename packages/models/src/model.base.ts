import { Model } from './types';

/**
 * Base model implementation with subscription support
 */
export abstract class BaseModel implements Model {
  id: string;

  constructor(id: string) {
    this.id = id;
  }
}
