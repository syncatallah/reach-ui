////////////////////////////////////////////////////////////////////////////////
// Welcome to @reach/slider!

import React, {
  cloneElement,
  createContext,
  forwardRef,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from "react";
import { node, func, number, string, bool, oneOf, oneOfType } from "prop-types";
import warning from "warning";
import { useId } from "@reach/auto-id";
import { wrapEvent } from "@reach/utils";
import { useTooltip, TooltipPopup } from "@reach/tooltip";

// A11y reference:
//   - http://www.oaa-accessibility.org/examplep/slider1/
//   - https://github.com/Stanko/aria-progress-range-slider

// TODO: Screen reader testing

// Example todos:
//  - Compose with other Reach elements (popover, tooltip, etc.)

// Random thoughts/notes:
//  - Currently testing this against the behavior of the native input range element to get
//    our slider on par. We'll explore animated and multi-handle sliders next.
//  - We may want to research some use cases for reversed sliders in RTL languages if that's a thing

const SliderOrientation = {
  horizontal: "horizontal",
  vertical: "vertical"
};

const HandleAlignment = {
  // Handle is centered directly over the current value marker
  center: "center",
  // Handle is contained within the bounds of the track, offset slightlu from the value's
  // center mark to accommodate
  contain: "contain"
};

const SliderContext = createContext({});
const useSliderContext = () => useContext(SliderContext);

////////////////////////////////////////////////////////////////////////////////
export const Slider = forwardRef(function Slider(
  {
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-valuetext": ariaValueText,
    defaultValue,
    disabled,
    value: controlledValue,
    getValueText,
    handleAlignment = HandleAlignment.center,
    id,
    max = 100,
    min = 0,
    name,
    onChange,
    onKeyDown,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    orientation = SliderOrientation.horizontal,
    step: stepProp,
    children,
    ...rest
  },
  forwardedRef
) {
  // Verify that the component is either controlled or uncontrolled throughout its lifecycle
  const { current: isControlled } = useRef(controlledValue != null);

  warning(
    !(isControlled && controlledValue == null),
    "Slider is changing from controlled to uncontrolled. Slider should not switch from controlled to uncontrolled (or vice versa). Decide between using a controlled or uncontrolled Slider for the lifetime of the component. Check the `value` prop being passed in."
  );

  warning(
    !(!isControlled && controlledValue != null),
    "Slider is changing from uncontrolled to controlled. Slider should not switch from uncontrolled to controlled (or vice versa). Decide between using a controlled or uncontrolled Slider for the lifetime of the component. Check the `value` prop being passed in."
  );

  const _id = makeId("slider", useId());

  const trackRef = useRef(null);
  const handleRef = useRef(null);
  const ownRef = useRef(null);
  const sliderRef = forwardedRef || ownRef;

  const [hasFocus, setHasFocus] = useState(false);
  const [isPointerDown, setPointerDown] = useState(false);
  const [value, setValue] = useState(defaultValue || min);

  const { ref: x, ...handleDimensions } = useDimensions(handleRef);

  const _value = isControlled ? controlledValue : value;
  const actualValue = getAllowedValue(_value, min, max);
  const trackPercent = valueToPercent(actualValue, min, max);
  const isVertical = orientation === SliderOrientation.vertical;
  const step = stepProp || 1;

  const handleSize = isVertical
    ? handleDimensions.height
    : handleDimensions.width;

  const handlePosition = `calc(${trackPercent}% - ${
    handleAlignment === HandleAlignment.center
      ? `${handleSize}px / 2`
      : `${handleSize}px * ${trackPercent * 0.01}`
  })`;

  const updateValue = useCallback(
    function updateValue(newValue) {
      if (!isControlled) {
        setValue(newValue);
      }
      if (onChange) {
        onChange(newValue, { min, max, handlePosition });
      }
    },
    [handlePosition, isControlled, max, min, onChange]
  );

  const getNewValueFromPointer = useCallback(
    function getNewValueFromPointer(event) {
      if (trackRef.current) {
        const {
          left,
          width,
          bottom,
          height
        } = trackRef.current.getBoundingClientRect();
        const { clientX, clientY } = event;
        let diff = isVertical ? bottom - clientY : clientX - left;
        let percent = diff / (isVertical ? height : width);
        let newValue = percentToValue(percent, min, max);

        if (step) {
          newValue = roundValueToStep(newValue, step);
        }
        newValue = getAllowedValue(newValue, min, max);
        return newValue;
      }
    },
    [isVertical, max, min, step]
  );

  const handleKeyDown = wrapEvent(onKeyDown, function(event) {
    let flag = false;
    let newValue;
    const tenSteps = (max - min) / 10;
    const keyStep = stepProp || (max - min) / 100;

    switch (event.key) {
      case "ArrowLeft":
      case "ArrowDown":
        newValue = actualValue - keyStep;
        flag = true;
        break;
      case "ArrowRight":
      case "ArrowUp":
        newValue = actualValue + keyStep;
        flag = true;
        break;
      case "PageDown":
        newValue = actualValue - tenSteps;
        flag = true;
        break;
      case "PageUp":
        newValue = actualValue + tenSteps;
        flag = true;
        break;
      case "Home":
        newValue = min;
        flag = true;
        break;
      case "End":
        newValue = max;
        flag = true;
        break;
      default:
        return;
    }

    if (flag) {
      // event.preventDefault();
      // event.stopPropagation();
    }

    newValue = roundValueToStep(newValue, keyStep);
    newValue = getAllowedValue(newValue, min, max);
    updateValue(newValue);
  });

  const handlePointerDown = wrapEvent(onPointerDown, function(event) {
    event.preventDefault();
    if (disabled) {
      if (isPointerDown) setPointerDown(false);
      return;
    }
    if (sliderRef.current && handleRef.current) {
      setPointerDown(true);
      const newValue = getNewValueFromPointer(event);
      sliderRef.current.setPointerCapture &&
        sliderRef.current.setPointerCapture(event.pointerId);
      if (newValue !== value) {
        updateValue(newValue);
      }
      handleRef.current.focus();
    }
  });

  const handlePointerUp = wrapEvent(onPointerUp, function(event) {
    if (sliderRef.current && event.pointerId) {
      sliderRef.current.releasePointerCapture &&
        sliderRef.current.releasePointerCapture(event.pointerId);
    }
    setPointerDown(false);
  });

  const valueText = getValueText ? getValueText(actualValue) : ariaValueText;

  const sliderId = id || _id;

  const trackHighlightStyle = isVertical
    ? {
        width: `100%`,
        height: `${trackPercent}%`,
        bottom: 0
      }
    : {
        width: `${trackPercent}%`,
        height: `100%`,
        left: 0
      };

  const ctx = {
    ariaLabelledBy,
    handleDimensions,
    handlePosition,
    handleRef,
    hasFocus,
    onKeyDown,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onHandleKeyDown: handleKeyDown,
    setHasFocus,
    sliderId,
    sliderMax: max,
    sliderMin: min,
    sliderValue: actualValue,
    valueText,
    disabled,
    isVertical,
    orientation,
    sliderStep: step,
    trackPercent,
    trackRef,
    trackHighlightStyle,
    updateValue
  };

  const dataAttributes = makeDataAttributes("slider", {
    disabled,
    orientation
  });

  useEffect(() => {
    const handlePointerMove = wrapEvent(onPointerMove, function(event) {
      const newValue = getNewValueFromPointer(event);
      if (newValue !== value) {
        updateValue(newValue);
      }
    });

    if (isPointerDown) {
      document.addEventListener("pointermove", handlePointerMove);
    }

    return () => {
      document.removeEventListener("pointermove", handlePointerMove);
    };
  }, [
    onPointerMove,
    getNewValueFromPointer,
    updateValue,
    isPointerDown,
    value
  ]);

  return (
    <SliderContext.Provider value={ctx}>
      <div
        role="presentation"
        ref={sliderRef}
        tabIndex={-1}
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        aria-disabled={disabled}
        id={sliderId}
        {...dataAttributes}
        {...rest}
      >
        {typeof children === "function"
          ? children({
              hasFocus,
              id: sliderId,
              max,
              min,
              value,
              valueText
            })
          : children}
        {name && (
          // If the slider is used in a form we'll need an input field to capture the value.
          // We'll assume this when the component is given a form field name
          // (A `name` prop doesn't really make sense in any other context)
          <input
            type="hidden"
            value={actualValue}
            name={name}
            id={`input:${sliderId}`}
          />
        )}
      </div>
    </SliderContext.Provider>
  );
});

Slider.displayName = "Slider";
Slider.propTypes = {
  defaultValue: number,
  disabled: bool,
  getValueText: func,
  handleAlignment: oneOf([HandleAlignment.center, HandleAlignment.contain]),
  min: number,
  max: number,
  name: string,
  orientation: oneOf([
    SliderOrientation.horizontal,
    SliderOrientation.vertical
  ]),
  onChange: func,
  children: oneOfType([node, func]).isRequired,
  step: number,
  value: number
};

////////////////////////////////////////////////////////////////////////////////
export const SliderTrack = forwardRef(function SliderTrack(
  { children, style = {}, ...props },
  forwardedRef
) {
  const { disabled, orientation, trackRef } = useSliderContext();
  const ownRef = useRef(null);
  const ref = forwardedRef || ownRef;
  const actualRef = useForkRef(ref, trackRef);

  const dataAttributes = makeDataAttributes("slider-track", {
    orientation,
    disabled
  });

  return (
    <div
      ref={actualRef}
      id="track"
      style={{ ...style, position: "relative" }}
      {...dataAttributes}
      {...props}
    >
      {children}
    </div>
  );
});

SliderTrack.displayName = "SliderTrack";
SliderTrack.propTypes = {
  children: node.isRequired
};

////////////////////////////////////////////////////////////////////////////////
export const SliderTrackHighlight = forwardRef(function SliderTrackHighlight(
  { children, style = {}, ...props },
  forwardedRef
) {
  const { disabled, orientation, trackHighlightStyle } = useSliderContext();
  const ownRef = useRef(null);
  const ref = forwardedRef || ownRef;

  const dataAttributes = makeDataAttributes("slider-track-highlight", {
    orientation,
    disabled
  });
  return (
    <div
      ref={ref}
      style={{ position: "absolute", ...trackHighlightStyle, ...style }}
      {...dataAttributes}
      {...props}
    />
  );
});

SliderTrackHighlight.displayName = "SliderTrackHighlight";
SliderTrackHighlight.propTypes = {};

////////////////////////////////////////////////////////////////////////////////
export const SliderHandle = forwardRef(function SliderHandle(
  {
    // min,
    // max,
    onBlur,
    onFocus,
    style = {},
    onKeyDown,
    ...props
  },
  forwardedRef
) {
  const {
    ariaLabelledBy,
    disabled,
    handlePosition,
    handleRef,
    isVertical,
    onHandleKeyDown,
    orientation,
    setHasFocus,
    sliderMin,
    sliderMax,
    sliderValue,
    valueText
  } = useSliderContext();

  const ownRef = useRef(null);
  const ref = forwardedRef || ownRef;
  const actualRef = useForkRef(ref, handleRef);
  const dataAttributes = makeDataAttributes("slider-handle", {
    orientation,
    disabled
  });

  return (
    <div
      ref={actualRef}
      role="slider"
      tabIndex={disabled ? undefined : 0}
      aria-disabled={disabled}
      aria-valuemin={sliderMin}
      aria-valuetext={valueText}
      aria-orientation={orientation}
      aria-valuenow={sliderValue}
      aria-valuemax={sliderMax}
      aria-labelledby={ariaLabelledBy}
      onBlur={wrapEvent(onBlur, () => {
        setHasFocus(false);
      })}
      onFocus={wrapEvent(onFocus, () => {
        setHasFocus(true);
      })}
      onKeyDown={wrapEvent(onKeyDown, onHandleKeyDown)}
      style={{
        position: "absolute",
        ...(isVertical ? { bottom: handlePosition } : { left: handlePosition }),
        ...style
      }}
      {...dataAttributes}
      {...props}
    />
  );
});

SliderHandle.displayName = "SliderHandle";
SliderHandle.propTypes = {};

////////////////////////////////////////////////////////////////////////////////
export const SliderMarker = forwardRef(function SliderMarker(
  { children, style = {}, value, ...props },
  forwardedRef
) {
  const {
    disabled,
    isVertical,
    orientation,
    sliderMin,
    sliderMax,
    sliderValue
  } = useSliderContext();

  const ownRef = useRef(null);
  const ref = forwardedRef || ownRef;
  const actualValue = valueToPercent(value, sliderMin, sliderMax);
  const highlight = sliderValue >= value;
  const dataAttributes = makeDataAttributes("slider-marker", {
    orientation,
    disabled,
    highlight
  });

  const absoluteStartPosition = `${actualValue}%`;

  return value != null ? (
    <div
      role="presentation"
      ref={ref}
      style={{
        position: "absolute",
        ...(isVertical
          ? { bottom: absoluteStartPosition }
          : { left: absoluteStartPosition }),
        ...style
      }}
      {...dataAttributes}
      {...props}
      children={children}
    />
  ) : null;
});

SliderMarker.displayName = "SliderMarker";
SliderMarker.propTypes = {
  value: number.isRequired
};

////////////////////////////////////////////////////////////////////////////////
export function SliderTooltip({ children, label, getLabel, ...props }) {
  const { disabled, orientation, sliderValue, valueText } = useSliderContext();
  const [trigger, tooltip] = useTooltip();

  const centered = (triggerRect, tooltipRect) => {
    const triggerCenter = triggerRect.left + triggerRect.width / 2;
    const left = triggerCenter - tooltipRect.width / 2;
    const maxLeft = window.innerWidth - tooltipRect.width - 2;
    return {
      left: Math.min(Math.max(2, left), maxLeft) + window.pageXOffset,
      top: triggerRect.bottom + 8 + window.pageYOffset
    };
  };

  // We want to show the tooltip whenever the handle is focused, regardless
  // of what happens with mouse events.
  const preventDefaultWhenFocused = useCallback(event => {
    if (document.activeElement === event.currentTarget) {
      event.preventDefault();
    }
  }, []);

  const getEventHandler = handler =>
    wrapEvent(preventDefaultWhenFocused, handler);

  const dataAttributes = makeDataAttributes("slider-tooltip", {
    orientation,
    disabled
  });

  const child = React.Children.only(children);

  return (
    <>
      {cloneElement(child, {
        ...trigger,
        onMouseLeave: wrapEvent(
          child.props.onMouseLeave,
          getEventHandler(trigger.onMouseLeave)
        ),
        onMouseMove: wrapEvent(
          child.props.onMouseMove,
          getEventHandler(trigger.onMouseMove)
        ),
        onMouseEnter: wrapEvent(
          child.props.onMouseEnter,
          getEventHandler(trigger.onMouseEnter)
        ),
        onMouseDown: wrapEvent(
          child.props.onMouseDown,
          getEventHandler(trigger.onMouseDown)
        )
      })}
      <TooltipPopup
        {...tooltip}
        {...dataAttributes}
        label={
          getLabel ? getLabel(sliderValue) : label || valueText || sliderValue
        }
        position={centered}
        {...props}
      />
    </>
  );
}

SliderTooltip.displayName = "SliderTooltip";
SliderTooltip.propTypes = {
  children: node,
  getLabel: func,
  label: node
};

////////////////////////////////////////////////////////////////////////////////
export function valueToPercent(value, min, max) {
  return ((value - min) * 100) / (max - min);
}

export function percentToValue(percent, min, max) {
  return (max - min) * percent + min;
}

export function makeValuePrecise(value, step) {
  const stepDecimalPart = step.toString().split(".")[1];
  const stepPrecision = stepDecimalPart ? stepDecimalPart.length : 0;
  return Number(value.toFixed(stepPrecision));
}

export function roundValueToStep(value, step) {
  return makeValuePrecise(Math.round(value / step) * step, step);
}

export function getAllowedValue(val, min, max) {
  return val > max ? max : val < min ? min : val;
}

export function makeDataAttributes(
  component = "slider",
  { orientation, highlight, disabled }
) {
  return {
    [`data-reach-${component}`]: "",
    [`data-reach-${component}-disabled`]: disabled ? "" : undefined,
    [`data-reach-${component}-orientation`]: orientation,
    [`data-reach-${component}-highlight`]: highlight ? orientation : undefined
  };
}

export function makeId(id, index) {
  return `${id}:${index}`;
}

// https://github.com/chakra-ui/chakra-ui/blob/master/packages/chakra-ui/src/utils/index.js#L9
export function assignRef(ref, value) {
  if (ref == null) return;
  if (typeof ref === "function") {
    ref(value);
  } else {
    try {
      ref.current = value;
    } catch (error) {
      throw new Error(`Cannot assign value "${value}" to ref "${ref}"`);
    }
  }
}

// https://github.com/mui-org/material-ui/blob/master/packages/material-ui/src/utils/useForkRef.js
export function useForkRef(refA, refB) {
  /**
   * This will create a new function if the ref props change and are defined.
   * This means React will call the old forkRef with `null` and the new forkRef
   * with the ref. Cleanup naturally emerges from this behavior.
   */
  const ref = React.useMemo(() => {
    if (refA == null && refB == null) {
      return null;
    }
    return refValue => {
      setRef(refA, refValue);
      setRef(refB, refValue);
    };
  }, [refA, refB]);

  function setRef(ref, value) {
    if (typeof ref === "function") {
      ref(value);
    } else if (ref) {
      ref.current = value;
    }
  }

  return ref;
}

export function useDimensions(passedRef) {
  const [{ width, height }, setDimensions] = useState({ width: 0, height: 0 });
  // Many existing `useDimensions` type hooks will use `getBoundingClientRect`
  // getBoundingClientRect does not work here when borders are applied.
  // getComputedStyle is not as performant so we may want to create a utility to check
  // for any conflicts with box sizing first and only use `getComputedStyle` if neccessary.
  /* const { width, height } = ref.current
    ? ref.current.getBoundingClientRect()
    : 0; */
  const ownRef = useRef(null);
  const ref = passedRef || ownRef;

  React.useLayoutEffect(() => {
    if (ref.current) {
      const { height: newHeight, width: newWidth } = window.getComputedStyle(
        ref.current
      );
      if (newHeight !== height || newWidth !== width) {
        setDimensions({
          height: parseFloat(newHeight),
          width: parseFloat(newWidth)
        });
      }
    }
  }, [ref, width, height]);
  return { ref, width, height };
}
