import { Elysia } from 'elysia';
import { ClientError } from '../../exceptions/ClientError.ts';
import { logger } from '../../utils/logger.ts';

interface ElysiaValidationErrorLike {
  customError?: unknown;
  valueError?: {
    schema?: {
      error?: unknown;
    };
    message?: string;
  };
  all?: Array<{
    summary?: string;
  }>;
}

function extractValidationMessage(error: unknown): string {
  const err = error as ElysiaValidationErrorLike | null | undefined;

  if (typeof err?.customError === 'string' && err.customError.trim().length > 0) {
    return err.customError;
  }

  const schemaError = err?.valueError?.schema?.error;
  if (typeof schemaError === 'string' && schemaError.trim().length > 0) {
    return schemaError;
  }

  const firstSummary = err?.all?.[0]?.summary;
  if (typeof firstSummary === 'string' && firstSummary.trim().length > 0) {
    return firstSummary;
  }

  const valueMessage = err?.valueError?.message;
  if (typeof valueMessage === 'string' && valueMessage.trim().length > 0) {
    return valueMessage;
  }

  return 'Validasi input gagal';
}

export const errorHandler = new Elysia({ name: 'errorHandler' }).onError(
  { as: 'global' },
  ({ code, error, request, set }) => {
    if (error instanceof ClientError) {
      set.status = error.statusCode;
      return Response.json(
        {
          status: 'error',
          message: error.message,
        },
        { status: error.statusCode },
      );
    }

    if (code === 'VALIDATION') {
      set.status = 400;
      return Response.json(
        {
          status: 'error',
          message: extractValidationMessage(error),
        },
        { status: 400 },
      );
    }

    if (code === 'PARSE') {
      set.status = 400;
      return Response.json(
        {
          status: 'error',
          message: 'Format JSON tidak valid',
        },
        { status: 400 },
      );
    }

    if (code === 'NOT_FOUND') {
      const url = new URL(request.url);
      set.status = 404;
      return Response.json(
        {
          status: 'error',
          message: `Rute ${url.pathname}${url.search} tidak ditemukan`,
        },
        { status: 404 },
      );
    }

    logger.error(error);
    set.status = 500;
    return Response.json(
      {
        status: 'error',
        message: 'Maaf, terjadi kegagalan pada server kami.',
      },
      { status: 500 },
    );
  },
);

export default errorHandler;
