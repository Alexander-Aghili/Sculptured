import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';
import { STREAM_BATCH } from './batcher';

// Tests apply each live event at once; the app collects them for STREAM_BATCH.ms.
STREAM_BATCH.ms = 0;

afterEach(() => cleanup());
