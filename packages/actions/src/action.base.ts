import { ActionResult, ApplicableContext } from './types';
import { ActionPayload, ExecuteContext } from './types';

import { Action } from './types';
import { z } from 'zod';
import { isEmptyZodObject } from './utils';
import { err, ok } from 'neverthrow';
import { type ActionTrackingContext } from './action-tracking';

export abstract class BaseAction<
  P extends ActionPayload,
  Errors extends { t: string }[] = { t: string }[]
> implements Action<P, Errors>
{
  abstract title: string;
  abstract inputSchema: z.ZodSchema<P>;

  abstract applicable(context: ApplicableContext): boolean;

  abstract execute(
    payload: P,
    context: ExecuteContext
  ): Promise<ActionResult<Errors>>;

  requiresInputArgs(): boolean {
    return !isEmptyZodObject(this.inputSchema);
  }

  async askOrExecute(
    payload: Partial<P>,
    context: ExecuteContext
  ): Promise<ActionResult<Errors>> {
    const action = this as Action<P, Errors> & {
      execute: (
        payload: P,
        context: ExecuteContext
      ) => Promise<ActionResult<Errors>>;
    };
    let executedPayload: P | null = null;

    const execute = async (
      payload: P,
      context: ExecuteContext
    ): Promise<ActionResult<Errors>> => {
      executedPayload = payload;
      if (
        (action.requiresInputArgs() && action.ask !== undefined) ||
        action.shouldAsk !== undefined
      ) {
        if (action.shouldAsk !== undefined && !action.shouldAsk(context)) {
          return await action.execute(payload, context);
        }

        const ask = action.ask!(payload, context);

        const askPromise = new Promise<ActionResult<Errors>>(
          (resolve, reject) => {
            ask.view({
              onCancel: () => {
                resolve(ok({ cancelled: true }));
              },
              onRespond: async (params): Promise<ActionResult<Errors>> => {
                try {
                  executedPayload = params;
                  const result = await action.execute(params, context);
                  resolve(result);

                  return result;
                } catch (e) {
                  reject(e);
                  return err([{ t: 'unknown-error' }]) as ActionResult<Errors>;
                }
              },
            });
          }
        );

        return await askPromise;
      } else {
        return await action.execute(payload, context);
      }
    };

    const res = await execute(payload as P, context);

    const finalPayload = executedPayload ?? (payload as P);

    if (res.isErr()) {
      const logger = context.getLogger();
      const errorMessage = prettyPrintErrors(res.error);

      // Flatten the typed errors so a reporter gets something legible
      const errorDetails = res.error.map((err) => ({
        type: err.t,
        message: 'message' in err ? err.message : undefined,
        ...(err as any),
      }));

      // The logger decides where this goes: console, error tracker, or both
      logger.error(errorMessage, res.error, {
        action: this.constructor.name,
        payload: finalPayload,
        errors: errorDetails,
      });
    }
    const trackContext: ActionTrackingContext<P, Errors> = {
      action: action as Action<P, Errors>,
      payload: finalPayload,
      context,
      result: res,
    };
    const metadata = action.track?.(trackContext) ?? null;

    context.track<P, Errors>({
      ...trackContext,
      metadata,
    });

    return res;
  }
}

const prettyPrintErrors = (
  errors: { t: string; message?: string }[]
): string => {
  return errors?.map(prettyPrintError).join('\n') ?? '';
};

const prettyPrintError = (error: { t: string; message?: string }): string => {
  return `
  type: ${error.t}
  ----------------------------
  ${error.message}
  `;
};
