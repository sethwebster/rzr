import { Stack } from 'expo-router';

export const unstable_settings = {
  initialRouteName: 'index',
};

export default function SessionsLayout() {
  return (
    <Stack screenOptions={{ headerShown: false, animation: 'none' }}>
      <Stack.Screen name="index" />
      <Stack.Screen
        name="[id]"
        options={{
          presentation: 'formSheet',
          animation: 'slide_from_bottom',
          sheetAllowedDetents: [1.0],
          sheetInitialDetentIndex: 0,
          sheetGrabberVisible: true,
          sheetCornerRadius: 28,
          // Decouple inner scroll from sheet-pan arbitration — without this
          // iOS's UISheetPresentationController waits for the first touch
          // event to resolve "is this a scroll or a sheet drag?" before
          // letting inner views process any touches. The symptom is: on
          // first open, nothing is tappable/scrollable until the user
          // drags the sheet grabber and releases it.
          sheetExpandsWhenScrolledToEdge: false,
        }}
      />
    </Stack>
  );
}
