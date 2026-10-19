import React, { useEffect, useState } from "react";
import { PurchaseItem, ShipmentItem } from "../types/api";
import { XIcon, CheckIcon, ClockIcon, TruckIcon, AlertCircleIcon } from "./icons";
import { api } from "../lib/api";

interface OrderDetailModalProps {
  order: PurchaseItem | null;
  isOpen: boolean;
  onClose: () => void;
}

export function OrderDetailModal({ order, isOpen, onClose }: OrderDetailModalProps) {
  const [shipment, setShipment] = useState<ShipmentItem | null>(null);
  const [isLoadingShipment, setIsLoadingShipment] = useState(false);
  const [shipmentError, setShipmentError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !order) {
      setShipment(null);
      setShipmentError(null);
      return;
    }

    const fetchShipment = async () => {
      setIsLoadingShipment(true);
      setShipmentError(null);
      try {
        const shipmentData = await api.getShipment(order.purchaseId);
        setShipment(shipmentData);
      } catch (err) {
        setShipmentError("Failed to load shipment status");
      } finally {
        setIsLoadingShipment(false);
      }
    };

    fetchShipment();
  }, [isOpen, order]);

  if (!isOpen || !order) return null;

  return (
    <div
      data-testid="order-detail-modal"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="bg-white dark:bg-zinc-900 rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-zinc-200 dark:border-zinc-800">
          <h3 className="text-base font-bold text-zinc-900 dark:text-zinc-100">
            Order Details
          </h3>
          <button
            type="button"
            onClick={onClose}
            data-testid="close-order-modal"
            className="p-1 text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100 transition-colors"
          >
            <XIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Order ID */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Order ID
            </label>
            <p className="text-sm font-mono text-zinc-900 dark:text-zinc-100 break-all">
              {order.purchaseId}
            </p>
          </div>

          {/* Timestamp */}
          <div className="space-y-1">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider">
              Order Date
            </label>
            <p className="text-sm text-zinc-900 dark:text-zinc-100">
              {new Date(order.createdAt).toLocaleString()}
            </p>
          </div>

          {/* Item Details */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <div className="flex items-start space-x-3">
              <div className="flex-shrink-0 w-12 h-12 bg-zinc-100 dark:bg-zinc-800 rounded flex items-center justify-center">
                <span className="text-lg font-bold text-zinc-600 dark:text-zinc-400">
                  #{String(order.pokemon.id).padStart(3, "0")}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-zinc-900 dark:text-zinc-100 capitalize">
                  {order.pokemon.name}
                </p>
                <p className="text-xs text-zinc-500">Quantity: {order.quantity}</p>
              </div>
            </div>
          </div>

          {/* Pricing */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-zinc-600 dark:text-zinc-400">Unit Price</span>
              <span className="font-mono text-zinc-900 dark:text-zinc-100">
                ₽ {order.pricing.unitPrice.toLocaleString()}
              </span>
            </div>
            <div className="flex justify-between text-sm font-bold">
              <span className="text-zinc-900 dark:text-zinc-100">Total</span>
              <span className="font-mono text-zinc-900 dark:text-zinc-100">
                ₽ {order.pricing.totalPrice.toLocaleString()}
              </span>
            </div>
          </div>

          {/* Shipping Status */}
          <div className="border-t border-zinc-200 dark:border-zinc-800 pt-4">
            <label className="text-xs font-medium text-zinc-500 uppercase tracking-wider block mb-2">
              Shipping Status
            </label>
            {isLoadingShipment ? (
              <div className="flex items-center space-x-2 text-xs text-zinc-500">
                <ClockIcon className="w-4 h-4 animate-spin" />
                <span>Loading shipment status...</span>
              </div>
            ) : shipmentError ? (
              <div className="flex items-center space-x-2 text-xs text-red-600 dark:text-red-400">
                <AlertCircleIcon className="w-4 h-4" />
                <span>{shipmentError}</span>
              </div>
            ) : shipment ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Order Status</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                    {shipment.orderStatus}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Processing</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                    {shipment.processingStatus}
                  </span>
                </div>
                <div className="flex items-center justify-between text-sm">
                  <span className="text-zinc-600 dark:text-zinc-400">Delivery</span>
                  <span className="font-medium text-zinc-900 dark:text-zinc-100 capitalize">
                    {shipment.deliveryStatus}
                  </span>
                </div>
                {shipment.trackingNumber && (
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-zinc-600 dark:text-zinc-400">Tracking #</span>
                    <span className="font-mono text-zinc-900 dark:text-zinc-100">
                      {shipment.trackingNumber}
                    </span>
                  </div>
                )}
                {shipment.lastError && (
                  <div className="flex items-start space-x-2 text-xs text-red-600 dark:text-red-400 mt-2">
                    <AlertCircleIcon className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{shipment.lastError}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-xs text-zinc-500 pt-2">
                  <span>Attempts: {shipment.attemptCount}</span>
                  <span>Updated: {new Date(shipment.updatedAt).toLocaleString()}</span>
                </div>
              </div>
            ) : (
              <div className="flex items-center space-x-2 text-xs text-zinc-500">
                <ClockIcon className="w-4 h-4" />
                <span>No shipment information available</span>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-4 py-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50">
          <button
            type="button"
            onClick={onClose}
            className="w-full px-4 py-2 text-sm font-medium text-zinc-900 dark:text-zinc-100 bg-white dark:bg-zinc-800 border border-zinc-300 dark:border-zinc-700 rounded hover:bg-zinc-50 dark:hover:bg-zinc-700 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
