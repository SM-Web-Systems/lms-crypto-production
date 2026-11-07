// Exercise the installed Router serializer, rather than the app's router mock.
// Navigation's config validator is outside this parser compatibility boundary.
jest.mock('@react-navigation/native', () => ({ validatePathConfig: jest.fn() }));
const { getPathFromState } = require('expo-router/build/fork/getPathFromState');

describe('installed Expo Router query compatibility', () => {
  it('serializes dynamic paths and Unicode query parameters with the patched parser', () => {
    const path = getPathFromState({ routes: [{ name: 'course', params: {
      id: 'course-123', query: 'Cape Town / 学生', tag: ['one', 'two'], empty: '',
    } }] }, { screens: { course: 'courses/:id' } });
    expect(path).toBe('/courses/course-123?query=Cape%20Town%20%2F%20%E5%AD%A6%E7%94%9F&tag=one&tag=two&empty=');
  });
});
