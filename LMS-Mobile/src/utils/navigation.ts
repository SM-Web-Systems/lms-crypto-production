import { useCallback } from 'react';
import { useFocusEffect, type Href, type Router } from 'expo-router';

/** Pop to the screen below (its state intact); a screen opened straight from a link has none, so go home. */
export function backOr(router: Pick<Router, 'canGoBack' | 'back' | 'replace'>, fallback: Href): void {
  if (router.canGoBack()) router.back();
  else router.replace(fallback);
}

type RootStack = {
  getState: () => { index: number; routes: { name: string }[] } | undefined;
  reset: (state: { index: number; routes: { name: string; params?: object }[] }) => void;
};

/**
 * Leave a root-Stack screen (Workspace, Account) for the student tabs. If the tabs are right below, pop back to them so
 * a half-done quiz or draft survives. Otherwise (for example, the wallet sign-in link opened this screen over sign-in)
 * start the Stack again at Dashboard, so Back can never land on the sign-in screen.
 */
export function openStudentTabs(router: Pick<Router, 'back'>, navigation: RootStack): void {
  const state = navigation.getState();
  if (state && state.index > 0 && state.routes[state.index - 1]?.name === '(student)') {
    router.back();
    return;
  }
  navigation.reset({ index: 0, routes: [{ name: '(student)', params: { screen: 'dashboard' } }] });
}

let inScreenBack: (() => boolean) | null = null;

/**
 * Android Back for a screen that steps through views of its own (course list, course, lesson) without the router.
 * While the screen is focused, the handler runs before the tabs' own Back; it returns true when it stepped back.
 * One owner at a time: the focused screen.
 */
export function useInScreenBack(handler: () => boolean): void {
  useFocusEffect(useCallback(() => {
    inScreenBack = handler;
    return () => { if (inScreenBack === handler) inScreenBack = null; };
  }, [handler]));
}

/** Called first by the tabs' Android Back listener. */
export function runInScreenBack(): boolean {
  return inScreenBack ? inScreenBack() : false;
}
