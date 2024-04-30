import {useLocation} from '@remix-run/react';
import type {SelectedOptionInput} from '@shopify/hydrogen-react/storefront-api-types';
import type {
  ProductOption,
  SelectedOption,
} from '@shopify/hydrogen/storefront-api-types';
import React, {type ReactNode, useMemo} from 'react';

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
  /** Encoded variat availability from the product object */
  encodedVariantAvailability: string;
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
    selectedOptions,
    encodedVariantAvailability,
    productPath = 'products',
    children,
  }: VariantSelectorProps) => {
    const {searchParams, path, alreadyOnProductPage} = useVariantPath(
      handle,
      productPath,
    );

    return (
      <>
        {options
          .filter((option) => option.values.length > 1)
          .map((option, optionIndex) => {
            const selectedOptionValue = selectedOptions[optionIndex].value;
            const clonedSearchParams = new URLSearchParams(
              alreadyOnProductPage ? searchParams : undefined,
            );

            return children({
              option: {
                name: option.name,
                value: selectedOptionValue,
                values: (option.values ?? []).map((optionValue) => {
                  const currentOptionValue = selectedOptions.map(
                    ({name, value}) => ({
                      name,
                      value: name === option.name ? optionValue : value,
                    }),
                  );
                  currentOptionValue.forEach(({name, value}) =>
                    clonedSearchParams.set(name, value),
                  );
                  const searchString = '?' + clonedSearchParams.toString();

                  return {
                    value: optionValue,
                    // note -- this changes the default to false if an option value is not present
                    isAvailable: isOptionValuePresent(
                      currentOptionValue.map(({value}) => value),
                      encodedVariantAvailability,
                      options,
                    ),
                    // isAvailable: variant ? variant.availableForSale! : true,
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

function useVariantPath(handle: string, productPath: string) {
  const {pathname, search} = useLocation();

  return useMemo(() => {
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
  }, [pathname, search, handle, productPath]);
}

type ValidOptionValues = number[][];

/**
 * For a set of option values, returns the indices of the option values for the product option set. If an option value is not found, throws an error.
 * @param targetOptionValues - option values to look up in the encoded option value string
 * @param productOptions - product options from the Storefront API
 * @returns
 */
export function getOptionValueIndices(
  targetOptionValues: string[],
  productOptions: Pick<ProductOption, 'name' | 'values'>[],
) {
  return targetOptionValues.map((optionValue, index) => {
    const optionValueIndex =
      productOptions[index]?.values?.indexOf(optionValue);
    if (optionValueIndex === -1) {
      throw new Error(
        `Option value "${optionValue}" not found in product options`,
      );
    }

    return optionValueIndex;
  });
}

/**
 * Determine whether a set of option values is present in an encoded option value string. Function is memoized to retain the last set of decoded option values.
 * @param targetOptionValues - option values to look up in the encoded option value string
 * @param encodedOptionValues - encoded option value string, e.g. response from product.encodedOptionValueAvailability or product.encodedOptionValueAvailability
 * @param productOptions - product options from the Storefront API
 */
export const isOptionValuePresent = (() => {
  const decodedOptionValues = new Map<string, Set<string>>();

  return function (
    targetOptionValues: string[],
    encodedOptionValues: string,
    productOptions: Pick<ProductOption, 'name' | 'values'>[],
  ): boolean {
    if (!decodedOptionValues.has(encodedOptionValues)) {
      // TODO are we worried about the size of this? Should we only store the last 1 encodedOptionValue?
      // decodedOptionValues.clear();
      console.error(decodeOptionValues(encodedOptionValues));
      decodedOptionValues.set(
        encodedOptionValues,
        new Set(
          decodeOptionValues(encodedOptionValues).map((optionValue) =>
            optionValue.join(','),
          ),
        ),
      );
    }

    console.error(decodedOptionValues);

    const optionValueIndices = getOptionValueIndices(
      targetOptionValues,
      productOptions,
    );
    return Boolean(
      decodedOptionValues
        .get(encodedOptionValues)
        ?.has(optionValueIndices.join(',')),
    );
  };
})();

/**
 * For an encoded option value string, decode into option value combinations. Entries represent a valid combination formatted as an array of option value positions.
 * @param encodedOptionValues
 * @returns
 */
export function decodeOptionValues(
  encodedOptionValues: string,
): ValidOptionValues {
  const tokenizer = /[ :,-]/g;
  let index = 0;
  let token: RegExpExecArray | null;
  let options: number[][] = [];
  let cur: number[] = [];
  let depth = 0;
  let range: number | null = null;
  while ((token = tokenizer.exec(encodedOptionValues))) {
    const operation = token[0];
    const optionValuePosition =
      Number.parseInt(encodedOptionValues.slice(index, token.index)) || 0;

    if (range !== null) {
      for (; range < optionValuePosition; range++) {
        cur[depth] = range;
        options.push(cur.slice());
      }
      range = null;
    }

    cur[depth] = optionValuePosition;

    if (operation === '-') {
      range = optionValuePosition;
    } else if (operation === ':') {
      depth++;
    } else {
      const prev = encodedOptionValues[token.index - 1];

      if (operation === ' ' || (operation === ',' && prev !== ',')) {
        options.push(cur.slice());
      }
      if (operation === ',') {
        cur.pop();
        depth--;
      }
    }
    index = tokenizer.lastIndex;
  }
  return options;
}
