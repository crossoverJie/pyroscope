import { renderSingle, RenderOutput } from '@pyroscope/services/render';
import { RequestAbortedError } from '@pyroscope/services/base';
import { addNotification } from '../notifications';
import { createAsyncThunk } from '../../async-thunk';
import { ContinuousState } from './state';

let singleViewAbortController: AbortController | undefined;

export const fetchSingleView = createAsyncThunk<
    RenderOutput,
    { spanId?: string } | null,
    { state: { continuous: ContinuousState } }
>('continuous/singleView', async (params, thunkAPI) => {
  if (singleViewAbortController) {
    singleViewAbortController.abort();
  }

  singleViewAbortController = new AbortController();
  thunkAPI.signal = singleViewAbortController.signal;

  const state = thunkAPI.getState();
  const renderParams = params?.spanId
      ? { ...state.continuous, spanId: params.spanId }
      : state.continuous;
  const res = await renderSingle(renderParams, singleViewAbortController);

  if (res.isOk) {
    return Promise.resolve(res.value);
  }

  if (res.isErr && res.error instanceof RequestAbortedError) {
    return Promise.reject(res.error);
  }

  thunkAPI.dispatch(
    addNotification({
      type: 'danger',
      title: 'Failed to load single view data',
      message: res.error.message,
    })
  );

  return Promise.reject(res.error);
});
