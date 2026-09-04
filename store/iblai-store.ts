/**
 * ibl.ai Redux store.
 *
 * The SDK's <Chat> selectors hard-code these slice keys (`state.chat`,
 * `state.rbac`, …) — do not rename them.
 */

import { configureStore } from "@reduxjs/toolkit";
import { coreApiSlice, mentorReducer, mentorMiddleware } from "@iblai/iblai-js/data-layer";
import {
  hostChatReducer,
  chatInputSliceReducer,
  chatSliceReducerShared,
  filesReducer,
  rbacReducer,
  subscriptionReducer,
  topBannerReducer,
} from "@iblai/iblai-js/web-utils";

export const iblaiStore = configureStore({
  reducer: {
    chat: hostChatReducer,
    chatInput: chatInputSliceReducer,
    chatSliceShared: chatSliceReducerShared,
    files: filesReducer,
    rbac: rbacReducer,
    subscription: subscriptionReducer,
    topBanner: topBannerReducer,
    [coreApiSlice.reducerPath]: coreApiSlice.reducer,
    ...mentorReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false })
      .concat(coreApiSlice.middleware)
      .concat(...mentorMiddleware),
});

export type IblaiRootState = ReturnType<typeof iblaiStore.getState>;
export type IblaiAppDispatch = typeof iblaiStore.dispatch;
