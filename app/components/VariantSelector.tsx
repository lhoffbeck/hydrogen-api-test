import {useLocation} from '@remix-run/react';
import type {SelectedOptionInput} from '@shopify/hydrogen-react/storefront-api-types';
import type {
  ProductOption,
  ProductVariant,
  SelectedOption,
} from '@shopify/hydrogen/storefront-api-types';
import React, {type ReactNode} from 'react';

export type VariantOption = {
  name: string;
  value?: string;
  values: Array<VariantOptionValue>;
};

export type VariantOptionValue = {
  value: string;
  isAvailable: boolean;
  to: string;
  search: string;
  isActive: boolean;
};

type VariantSelectorProps = {
  /** The product handle for all of the variants */
  handle: string;
  /** The currently selected options */
  selectedOptions: SelectedOption[];
  /**
   * Adjacent product variants from the products query. You only need to pass this prop if you want to show product availability or use combined listings.
   * Include the product handle if you want to support combined listings. If a product option combination is not found within `variants`, it is assumed to be available.
   */
  variants?: Array<
    Pick<ProductVariant, 'availableForSale' | 'selectedOptions'> & {
      handle?: ProductVariant['product']['handle'];
    }
  >;
  /** Product options from the [Storefront API](/docs/api/storefront/2024-01/objects/ProductOption). */
  options: Array<Pick<ProductOption, 'name' | 'values'>> | undefined;
  /** By default all products are under /products. Use this prop to provide a custom path. */
  productPath?: string;
  children: ({option}: {option: VariantOption}) => ReactNode;
};

export const VariantSelector = React.memo(
  ({
    handle,
    options = [],
    variants,
    selectedOptions,
    productPath = 'products',
    children,
  }: VariantSelectorProps) => {
    const getVariantPath = useVariantPath();

    return (
      <>
        {options
          .filter((option) => option.values.length > 1)
          .map((option, optionIndex) => {
            const selectedOptionValue = selectedOptions[optionIndex].value;
            return children({
              option: {
                name: option.name,
                value: selectedOptionValue,
                values: (option.values ?? []).map((optionValue) => {
                  const currentOptionValue: Record<string, string> =
                    selectedOptions.reduce(
                      (acc, {name, value}) => ({
                        ...acc,
                        [name]: name === option.name ? optionValue : value,
                      }),
                      {},
                    );
                  const variant = variants?.find((variant) =>
                    variant.selectedOptions?.every(
                      (selectedOption) =>
                        currentOptionValue[selectedOption?.name] ===
                        selectedOption?.value,
                    ),
                  );
                  const {alreadyOnProductPage, searchParams, path} =
                    getVariantPath(variant?.handle ?? handle, productPath);
                  const clonedSearchParams = new URLSearchParams(
                    alreadyOnProductPage ? searchParams : undefined,
                  );
                  Object.entries(currentOptionValue).forEach(([name, value]) =>
                    clonedSearchParams.set(name, value),
                  );
                  const searchString = '?' + clonedSearchParams.toString();

                  return {
                    value: optionValue,
                    isAvailable: Boolean(variant?.availableForSale),
                    to: path + searchString,
                    search: searchString,
                    isActive: optionValue === selectedOptionValue,
                  };
                }),
              },
            });
          })}
      </>
    );
  },
);

const SHOPIFY_PARAMS = ['_sid', '_pos', '_psq', '_ss', '_v', 'fbclid'];
export const getSelectedProductOptions = (
  request: Request,
): SelectedOptionInput[] => {
  if (typeof request?.url === 'undefined')
    throw new TypeError(`Expected a Request instance, got ${typeof request}`);

  return Array.from(new URL(request.url).searchParams)
    .filter(([name]) => !SHOPIFY_PARAMS.some((param) => name.startsWith(param)))
    .map(([name, value]) => ({name, value}));
};

function useVariantPath() {
  const {pathname, search} = useLocation();

  return (handle: string, productPath: string) => {
    const match = /(\/[a-zA-Z]{2}-[a-zA-Z]{2}\/)/g.exec(pathname);
    const isLocalePathname = match && match.length > 0;
    productPath = productPath.startsWith('/')
      ? productPath.substring(1)
      : productPath;

    const path = isLocalePathname
      ? `${match![0]}${productPath}/${handle}`
      : `/${productPath}/${handle}`;

    const searchParams = new URLSearchParams(search);

    return {
      searchParams,
      // If the current pathname matches the product page, we need to make sure
      // that we append to the current search params. Otherwise all the search
      // params can be generated new.
      alreadyOnProductPage: path === pathname,
      path,
    };
  };
}
