// Libraries with native parts that don't run under Jest, replaced by their own official mocks.
jest.mock('@react-native-async-storage/async-storage', () => require('@react-native-async-storage/async-storage/jest/async-storage-mock'));
jest.mock('@react-native-community/netinfo', () => require('@react-native-community/netinfo/jest/netinfo-mock.js'));
jest.mock('react-native-worklets', () => require('react-native-worklets/lib/module/mock'));
jest.mock('react-native-reanimated', () => require('react-native-reanimated/mock'));
