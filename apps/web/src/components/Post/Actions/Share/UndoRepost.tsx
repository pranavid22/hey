import cn from "@/helpers/cn";
import errorToast from "@/helpers/errorToast";
import trackEvent from "@/helpers/trackEvent";
import useTransactionLifecycle from "@/hooks/useTransactionLifecycle";
import { useAccountStore } from "@/store/persisted/useAccountStore";
import { useApolloClient } from "@apollo/client";
import { MenuItem } from "@headlessui/react";
import { ArrowsRightLeftIcon } from "@heroicons/react/24/outline";
import { Errors } from "@hey/data/errors";
import { isRepost } from "@hey/helpers/postHelpers";
import { type AnyPostFragment, useDeletePostMutation } from "@hey/indexer";
import type { Dispatch, SetStateAction } from "react";
import { toast } from "sonner";

interface UndoRepostProps {
  post: AnyPostFragment;
  isSubmitting: boolean;
  setIsSubmitting: Dispatch<SetStateAction<boolean>>;
}

const UndoRepost = ({
  post,
  isSubmitting,
  setIsSubmitting
}: UndoRepostProps) => {
  const { currentAccount } = useAccountStore();
  const { cache } = useApolloClient();
  const handleTransactionLifecycle = useTransactionLifecycle();

  const targetPost = isRepost(post) ? post?.repostOf : post;

  const updateCache = () => {
    cache.modify({
      fields: { reposts: () => targetPost.stats.reposts - 1 },
      id: cache.identify(targetPost.stats)
    });
    cache.evict({ id: cache.identify(post) });
  };

  const onCompleted = () => {
    setIsSubmitting(false);
    updateCache();
    trackEvent("undo_repost", { post: post.slug });
    toast.success("Undone repost");
  };

  const onError = (error?: any) => {
    setIsSubmitting(false);
    errorToast(error);
  };

  const [undoRepost] = useDeletePostMutation({
    onCompleted: async ({ deletePost }) => {
      if (deletePost.__typename === "DeletePostResponse") {
        return onCompleted();
      }

      return await handleTransactionLifecycle({
        transactionData: deletePost,
        onCompleted,
        onError
      });
    }
  });

  const handleUndoRepost = async () => {
    if (!currentAccount) {
      return toast.error(Errors.SignWallet);
    }

    setIsSubmitting(true);

    return await undoRepost({
      variables: { request: { post: post.id } }
    });
  };

  return (
    <MenuItem
      as="div"
      className={({ focus }) =>
        cn(
          { "dropdown-active": focus },
          "m-2 block cursor-pointer rounded-lg px-4 py-1.5 text-red-500 text-sm"
        )
      }
      disabled={isSubmitting}
      onClick={handleUndoRepost}
    >
      <div className="flex items-center space-x-2">
        <ArrowsRightLeftIcon className="size-4" />
        <div>Undo repost</div>
      </div>
    </MenuItem>
  );
};

export default UndoRepost;
