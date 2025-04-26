import React, {
  forwardRef,
  type Ref,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';
import {
  Animated,
  type GestureResponderHandlers,
  type MaximumOneOf,
  type ScaleTransform,
  type TranslateXTransform,
  type TranslateYTransform,
  View,
  type ViewStyle,
} from 'react-native';
import { asyncWaitForMS, generateRandomInteger } from './utils';
import type { DraggableMasonryGridCardWrapperRef } from './types';

const ROTATION_ANGLE_X_DEG = 2;
const ROTATION_ANGLE_Y_DEG = 1;
const ROTATION_ANGLE_Z_DEG = 0.7;
const ROTATION_ANIMATION_MS = 180;

type Props = {
  children: React.ReactNode;
  panHandlers: GestureResponderHandlers | undefined;
  alwaysRender: boolean;
  style: Omit<Animated.AnimatedProps<ViewStyle>, 'transform'> & {
    transform: Readonly<
      MaximumOneOf<ScaleTransform & TranslateXTransform & TranslateYTransform>[]
    >;
  };
  wobble: boolean;
};
export const DraggableMasonryGridCardWrapper = forwardRef(
  (props: Props, ref: Ref<DraggableMasonryGridCardWrapperRef>) => {
    const viewRef = useRef<View>(null);
    const rotationAnimation = useRef(new Animated.Value(0)).current;
    const [shouldRender, setShouldRender] = useState(false);

    useEffect(() => {
      if (!props.wobble) return;
      const animation = Animated.loop(
        Animated.sequence([
          Animated.timing(rotationAnimation, {
            duration: ROTATION_ANIMATION_MS,
            toValue: 1,
            useNativeDriver: true,
          }),
          Animated.timing(rotationAnimation, {
            duration: ROTATION_ANIMATION_MS,
            toValue: -1,
            useNativeDriver: true,
          }),
        ])
      );
      (async () => {
        await asyncWaitForMS(
          generateRandomInteger(0, Number.MAX_SAFE_INTEGER) % 500
        );
        animation.start();
      })();
      return () => {
        animation.stop();
        rotationAnimation.setValue(0);
      };
    }, [props.wobble]);

    useImperativeHandle(
      ref,
      () => ({
        setShouldRender,
        viewRef,
      }),
      []
    );

    return (
      <Animated.View
        {...props.panHandlers}
        ref={viewRef}
        style={[
          props.style,
          {
            transform: [
              ...props.style.transform,
              {
                rotateX: rotationAnimation.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [
                    `-${ROTATION_ANGLE_X_DEG}deg`,
                    '0deg',
                    `${ROTATION_ANGLE_X_DEG}deg`,
                  ],
                }),
              },
              {
                rotateY: rotationAnimation.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [
                    `-${ROTATION_ANGLE_Y_DEG}deg`,
                    '0deg',
                    `${ROTATION_ANGLE_Y_DEG}deg`,
                  ],
                }),
              },
              {
                rotateZ: rotationAnimation.interpolate({
                  inputRange: [-1, 0, 1],
                  outputRange: [
                    `-${ROTATION_ANGLE_Z_DEG}deg`,
                    '0deg',
                    `${ROTATION_ANGLE_Z_DEG}deg`,
                  ],
                }),
              },
            ],
          },
        ]}
      >
        {props.alwaysRender || shouldRender ? props.children : null}
      </Animated.View>
    );
  }
);
