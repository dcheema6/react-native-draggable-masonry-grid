import type { Animated, View } from 'react-native';

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
  viewRef: React.RefObject<View>;
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
