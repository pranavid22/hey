import TransferFundButton from "@/components/Shared/Account/Fund/FundButton";
import LoginButton from "@/components/Shared/LoginButton";
import { Button, Spinner } from "@/components/Shared/UI";
import errorToast from "@/helpers/errorToast";
import getCollectActionData from "@/helpers/getCollectActionData";
import trackEvent from "@/helpers/trackEvent";
import useTransactionLifecycle from "@/hooks/useTransactionLifecycle";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import { useApolloClient } from "@apollo/client";
import { HEY_TREASURY } from "@hey/data/constants";
import {
  type PostActionFragment,
  type PostFragment,
  useAccountBalancesQuery,
  useExecutePostActionMutation
} from "@hey/indexer";
import { useState } from "react";
import { toast } from "sonner";

interface CollectActionButtonProps {
  collects: number;
  onCollectSuccess?: () => void;
  postAction: PostActionFragment;
  post: PostFragment;
}

const CollectActionButton = ({
  collects,
  onCollectSuccess = () => {},
  postAction,
  post
}: CollectActionButtonProps) => {
  const collectAction = getCollectActionData(postAction as any);
  const { currentAccount } = useAccountStore();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasSimpleCollected, setHasSimpleCollected] = useState(
    collectAction?.amount ? false : post.operations?.hasSimpleCollected
  );
  const { cache } = useApolloClient();
  const handleTransactionLifecycle = useTransactionLifecycle();

  const endTimestamp = collectAction?.endsAt;
  const collectLimit = collectAction?.collectLimit;
  const amount = collectAction?.amount as number;
  const assetAddress = collectAction?.assetAddress as any;
  const assetSymbol = collectAction?.assetSymbol as string;
  const isAllCollected = collectLimit ? collects >= collectLimit : false;
  const isSaleEnded = endTimestamp
    ? new Date(endTimestamp).getTime() / 1000 < new Date().getTime() / 1000
    : false;
  const canCollect = !hasSimpleCollected;

  const updateCache = () => {
    if (!post.operations) {
      return;
    }

    cache.modify({
      fields: { hasSimpleCollected: () => true },
      id: cache.identify(post.operations)
    });
    cache.modify({
      fields: {
        stats: (existingData) => ({
          ...existingData,
          collects: collects + 1
        })
      },
      id: cache.identify(post)
    });
  };

  const onCompleted = (hash: string) => {
    // Should not disable the button if it's a paid collect module
    setHasSimpleCollected(amount <= 0);
    setIsSubmitting(false);
    onCollectSuccess?.();
    updateCache();
    trackEvent("collect", { post: post.slug });
    // Track e-commerce event for GA
    if (assetSymbol === "GHO" || assetSymbol === "WGHO") {
      trackEvent("purchase", {
        transaction_id: hash,
        product_type: "collect",
        value: amount,
        currency: "USD"
      });
    }
    toast.success("Collected successfully");
  };

  const onError = (error: Error) => {
    setIsSubmitting(false);
    errorToast(error);
  };

  const { data: balance, loading: balanceLoading } = useAccountBalancesQuery({
    variables: { request: { tokens: [assetAddress] } },
    pollInterval: 3000,
    skip: !assetAddress || !currentAccount?.address,
    fetchPolicy: "no-cache"
  });

  const erc20Balance =
    balance?.accountBalances[0].__typename === "Erc20Amount"
      ? balance.accountBalances[0].value
      : 0;

  let hasAmount = false;
  if (Number.parseFloat(erc20Balance) < amount) {
    hasAmount = false;
  } else {
    hasAmount = true;
  }

  const [executeCollectAction] = useExecutePostActionMutation({
    onCompleted: async ({ executePostAction }) => {
      if (executePostAction.__typename === "ExecutePostActionResponse") {
        return onCompleted(executePostAction.hash);
      }

      return await handleTransactionLifecycle({
        transactionData: executePostAction,
        onCompleted,
        onError
      });
    },
    onError
  });

  const handleCreateCollect = async () => {
    setIsSubmitting(true);

    return await executeCollectAction({
      variables: {
        request: {
          post: post.id,
          action: {
            simpleCollect: {
              selected: true,
              referrals: [{ address: HEY_TREASURY, percent: 100 }]
            }
          }
        }
      }
    });
  };

  if (!currentAccount) {
    return (
      <LoginButton
        className="mt-5 w-full justify-center"
        title="Login to Collect"
      />
    );
  }

  if (balanceLoading) {
    return (
      <Button
        className="mt-5 w-full"
        disabled
        icon={<Spinner className="my-1" size="xs" />}
      />
    );
  }

  if (!canCollect) {
    return null;
  }

  if (isAllCollected || isSaleEnded) {
    return null;
  }

  if (!hasAmount) {
    return (
      <TransferFundButton
        className="mt-5 w-full"
        token={{ contractAddress: assetAddress, symbol: assetSymbol }}
      />
    );
  }

  return (
    <Button
      className="mt-5 w-full justify-center"
      disabled={isSubmitting}
      loading={isSubmitting}
      onClick={handleCreateCollect}
    >
      Collect now
    </Button>
  );
};

export default CollectActionButton;
