import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { BarcodeCaptureListener } from "scandit-web-datacapture-barcode";
import {
  BarcodeCapture,
  barcodeCaptureLoader,
  BarcodeCaptureOverlay,
  BarcodeCaptureSettings,
  Symbology,
} from "scandit-web-datacapture-barcode";
import {
  Camera,
  CameraSwitchControl,
  configure,
  DataCaptureContext,
  DataCaptureView,
  FrameSourceState,
  LaserlineViewfinder,
} from "scandit-web-datacapture-core";

export interface SDK {
  initialize: () => Promise<void>;
  cleanup: () => Promise<void>;
  connectToElement: (element: HTMLElement) => void;
  detachFromElement: () => void;
  enableCamera: (enabled: boolean) => Promise<void>;
  enableScanning: (enabled: boolean) => Promise<void>;
  enableSymbology: (symbology: Symbology, enabled: boolean) => Promise<void>;
  onScan: (callback: NonNullable<BarcodeCaptureListener["didScan"]>) => void;
  getEnabledSymbologies: () => Symbology[];
}

export interface SDKWithLoadingStatus {
  loading: boolean;
  sdk: SDK;
}

export function createSDKFacade(): SDK {
  let context: DataCaptureContext | undefined;
  let view: DataCaptureView;
  let camera: Camera;
  let settings: BarcodeCaptureSettings;
  let barcodeCapture: BarcodeCapture;
  let overlay: BarcodeCaptureOverlay;
  let host: HTMLElement;
  let barcodeCaptureListener: BarcodeCaptureListener;

  return {
    async initialize() {
      // There is a Scandit sample license key set below here.
      // This license key is enabled for sample evaluation only.
      // If you want to build your own application, get your license key by signing up for a trial at https://ssl.scandit.com/dashboard/sign-up?p=test
      // The library location option represents the location of the wasm file, which will be fetched asynchronously.
      await configure({
        libraryLocation: new URL("library/engine", document.baseURI).toString(),
        licenseKey: "AUvDOzMiF/miK9JdND7/434ZHod3L9ecN18fy1JGgJ7ZIRYcuh2fSZAuXnNcSRFE91kX2CkjpyblTQHtg3wxnRpwSDPNU1oKXiDhrzlynJxbZIHLpD9th3RREe/EYm4Sik+9aYFhIJUAXh2xliyfj0Vtsb/qUv+qiFBwU0Y1daCqTXkgYFmDNmB8UqiXZMXOOl1tNTxC03bCa4OfBmgKr3sO5pt6d655ESxG621gv9dnQhuzbV65e2kRqRPFblAtkU0PbC94ihwIbqQcW2TpF2J/deJ6T5WFCmqFcqxYG5QYZoINM1YedohDtkWmYUb4pWOHDQJXwFGEeOhw+mzHdL9XOUj9atb+EmYqksF2Zj88Juyyl3vJQk9Y/iO+WBXFoGkKtatc9zCQd72gn1tbxq1XigPHVI4KN30xPchNK9/oet11tlEM491naXl6RRcRxlVA7S1OVg8hCAhABl4w/RJiDitdZIBad16DJfpnUCIed5MhdXJBTlFIEdP0fOFPPk36DUlg+u6db6wm5Bm2oDtgCuA2CtHTYSfhNDg6iEaGDwZJXxM/6KRkt9pYj5dvaiyNH5L+7nn/wAsX7DpRFI4MUgx+ouG2fCsGYcoYOW78l2KYBG3wzs4pJii1oRJifLE8KjDHtgPTRHWrhbvm2TpzVgGK+4mJWkaWm9FOrfRHwu5wKIlPvNEk1prV9HxhukaMci95JQ0H/1O4SGr2qIG9wmzU0xrpwbW9zumA8NCGoXn1H3PXNlrkHh9PCN+Yevkj/qoHp5R5JD7FtlIn+MkscoR7fE4wOOcSdES9Tu9zrzky97UURYi+7+EqiEsskeRpKJgYrs/EfT93Q0eOCMXEYTaOJTvf65UUiQGmNlPqhwFupvmbkMtlYfVokHb72sL3s9hy3FVjMgOriVUWEM8Cqvq7MAGx4XQrdsMy2CgNlEL6IFWXC/ezf2aLwZTtIaMF8kqlLY7Zcs/UcQT/rqaNC277QX+vTofyMgZtGVwJt4V5/ODL07Km3vOwPVmwEDWIOtp+YWll37DBBFq/S5ojycYwvU23bbrFIJxIGmzwi3w35xKghoUiax9vAyiB/BXTJgULRxRiz2/ONenTSm7lkGUdgiGEDEX8H3zAayWxypGGUVkNEFBTjMqz226TOKvM2HVsAAK2dYTV/nskcLr5GIz4WSy8AsWqb/VVcMekMuLInUju6AN586Irs2Eg0rfobiQaJxQCtWP8ExewWKaYQOjKpXE=",
        moduleLoaders: [barcodeCaptureLoader()],
      });

      context = await DataCaptureContext.create();
      view = await DataCaptureView.forContext(context);
      settings = new BarcodeCaptureSettings();
      settings.enableSymbologies([
        Symbology.EAN13UPCA,
        Symbology.EAN8,
        Symbology.UPCE,
        Symbology.QR,
        Symbology.DataMatrix,
        Symbology.Code39,
        Symbology.Code128,
        Symbology.InterleavedTwoOfFive,
      ]);

      barcodeCapture = await BarcodeCapture.forContext(context, settings);
      await barcodeCapture.setEnabled(false);

      overlay = await BarcodeCaptureOverlay.withBarcodeCaptureForView(barcodeCapture, view);
      await overlay.setViewfinder(new LaserlineViewfinder());
      await view.addOverlay(overlay);

      camera = Camera.default;
      await camera.applySettings(BarcodeCapture.recommendedCameraSettings);
      await context.setFrameSource(camera);

      // ============================================================================================================
      // NOTE:
      // The following is a workaround to keep the scanner working correctly with React.
      // The DataCaptureView requires the host element to remain the same throughout its lifecycle.
      // Unfortunately, between re-renders, React doesn't keep the same nodes alive, but creates new ones each time.
      // This means that, between re-renders, the DataCaptureView might stop rendering overlays, viewfinders etc...
      // To fix this, we connect the DataCaptureView to a hidden element, then append it to a React component.
      // This allows us to keep the node alive, and the DataCaptureView rendering correctly.
      // When mounting the scanner component, we show the hidden node, then hide it when unmounting the scanner.
      // See also the `connectToElement` and `detachFromElement` facade methods for further context.
      // ============================================================================================================
      host = document.createElement("div");
      host.style.display = "none";
      host.style.width = "100%";
      host.style.height = "100%";
      document.body.append(host);
      view.connectToElement(host);
      view.addControl(new CameraSwitchControl());
    },
    async cleanup() {
      await camera.switchToDesiredState(FrameSourceState.Off);
      await context?.dispose();
      await context?.removeAllModes();
      await view.removeOverlay(overlay);
      barcodeCapture.removeListener(barcodeCaptureListener);
      view.detachFromElement();
    },
    connectToElement(element: HTMLElement) {
      host.style.display = "block";
      element.append(host);
    },
    detachFromElement() {
      host.style.display = "none";
      document.body.append(host);
    },
    async enableCamera(enabled: boolean) {
      camera = context?.frameSource as Camera;
      await camera.switchToDesiredState(enabled ? FrameSourceState.On : FrameSourceState.Off);
    },
    async enableScanning(enabled: boolean) {
      await barcodeCapture.setEnabled(enabled);
    },
    async enableSymbology(symbology: Symbology, enabled: boolean) {
      settings.enableSymbology(symbology, enabled);
      await barcodeCapture.applySettings(settings);
    },
    onScan(callback: NonNullable<BarcodeCaptureListener["didScan"]>) {
      barcodeCaptureListener = {
        didScan: callback,
      };
      barcodeCapture.addListener(barcodeCaptureListener);
    },
    getEnabledSymbologies() {
      return settings.enabledSymbologies;
    },
  };
}

export const sdk = createSDKFacade();

export const SDKContext = createContext({
  loading: false,
  sdk,
});

export interface SDKProviderProps {
  children: ReactNode;
}

export default function SDKProvider({ children }: SDKProviderProps): JSX.Element {
  const [loading, setLoading] = useState(true);
  const providerValue = useMemo(() => ({ loading, sdk }), [loading]);

  useEffect(() => {
    async function start(): Promise<void> {
      await sdk.initialize();
      setLoading(false);
    }
    void start();
    return () => {
      void sdk.cleanup();
    };
  }, []);

  return <SDKContext.Provider value={providerValue}>{children}</SDKContext.Provider>;
}

export function useSDK(): SDKWithLoadingStatus {
  return useContext(SDKContext);
}
