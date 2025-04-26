import type { ReactElement } from 'react';
import type {
  Animated,
  FlatListProps,
  GestureResponderHandlers,
  MaximumOneOf,
  ScaleTransform,
  TranslateXTransform,
  TranslateYTransform,
  View,
  ViewabilityConfigCallbackPairs,
  ViewStyle,
} from 'react-native';

export type MasonaryGridWobbleAnimationConfig = {
  rotionAngleXDeg: number;
  rotionAngleYDeg: number;
  rotionAngleZDeg: number;
  rotionAnimationTimeMS: number;
};
export type GridCardWrapperProps = {
  children: React.ReactNode;
  panHandlers: GestureResponderHandlers | undefined;
  alwaysRender: boolean;
  style: Omit<Animated.AnimatedProps<ViewStyle>, 'transform'> & {
    transform: Readonly<
      MaximumOneOf<ScaleTransform & TranslateXTransform & TranslateYTransform>[]
    >;
  };
  wobble: boolean;
  wobbleAnimationConfig?: MasonaryGridWobbleAnimationConfig;
};
export type DraggableMasonryGridListProps<T> = Omit<
  FlatListProps<DraggableMasonryGridListData<T>[]>,
  | 'data'
  | 'getItemLayout'
  | 'keyExtractor'
  | 'onScroll'
  | 'renderItem'
  | 'scrollEventThrottle'
> & {
  columnViewabilityConfigCallbackPairs?: ViewabilityConfigCallbackPairs[];
  columnWidth: number;
  data: DraggableItem<T>[];
  keyExtractor: (item: DraggableMasonryGridListItem<T>) => string;
  onRearrange(rearrangedData: DraggableItem<T>[]): void;
  onScroll?(offsetY: number): void;
  renderItem(
    item: DraggableMasonryGridListItem<T>,
    drag: () => void,
    dragRelease: () => void
  ): ReactElement | null;
  /**
   * This controls how often the scroll event will be fired while scrolling (as a time interval in ms).
   * A lower number yields better accuracy for code that is tracking the scroll position,
   * but can lead to scroll performance problems due to the volume of information being sent over the bridge.
   * The default value is zero, which means the scroll event will be sent every time the view is scrolled.
   */
  scrollEventThrottle?: number;
  viewPostOffsets?: {
    top?: number;
    bottom?: number;
  };
  wobble?: boolean;
  wobbleAnimationConfig: MasonaryGridWobbleAnimationConfig;
};

export type Coordinates = { x: number; y: number };
export type Vertices = {
  topCenter: Coordinates;
  topLeft: Coordinates;
  topRight: Coordinates;
  bottomCenter: Coordinates;
  bottomLeft: Coordinates;
  bottomRight: Coordinates;
  center: Coordinates;
};

export type DraggableMasonryGridListRef = {
  scrollToTop(animated?: boolean): void;
  scrollToIndex(options: {
    animated?: boolean;
    index: number;
    offset: number;
  }): void;
  animateToOriginalPositions(): Promise<void>;
};
export type DraggableMasonryGridCardWrapperRef = {
  viewRef: React.RefObject<View | null>;
  setShouldRender(shouldRender: boolean): void;
};

export type DraggableGridCardRef = {
  offsets?: Partial<Vertices>;
  key: string;
  position: Animated.ValueXY;
  ref: React.RefObject<DraggableMasonryGridCardWrapperRef | null>;
  vertices?: Vertices;
};

export type DraggableItem<T> =
  | {
      height: number;
      isDraggable: boolean;
      item: T;
      type: 'ITEM';
      verticeoffsets?: Partial<Vertices>;
    }
  | {
      type: 'HEIGHT_EQUILIZER';
    };
export type DraggableMasonryGridListItem<T> = {
  columnIndex: number;
  height: number;
  isDraggable: boolean;
  index: number;
  item: T;
  offsetY: number;
  originalIndex: number;
  position: Coordinates;
  type: 'item';
  verticeoffsets?: Partial<Vertices>;
};
export type DraggableMasonryGridListEmptySpace = {
  columnIndex: number;
  height: number;
  isDraggable: boolean;
  index: number;
  offsetY: number;
  originalIndex: number;
  position: Coordinates;
  type: 'empty_space';
};
export type DraggableMasonryGridListData<T> =
  | DraggableMasonryGridListItem<T>
  | DraggableMasonryGridListEmptySpace;
